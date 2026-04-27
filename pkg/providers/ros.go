package providers

import (
	"context"
	"encoding/json"
	"github.com/bluenviron/goroslib/v2"
	"github.com/bluenviron/goroslib/v2/pkg/msgs/geometry_msgs"
	"github.com/bluenviron/goroslib/v2/pkg/msgs/nav_msgs"
	"github.com/bluenviron/goroslib/v2/pkg/msgs/sensor_msgs"
	"github.com/bluenviron/goroslib/v2/pkg/msgs/visualization_msgs"
	"github.com/cedbossneo/openmower-gui/pkg/msgs/dynamic_reconfigure"
	"github.com/cedbossneo/openmower-gui/pkg/msgs/mower_msgs"
	"github.com/cedbossneo/openmower-gui/pkg/msgs/std_msgs"
	"github.com/cedbossneo/openmower-gui/pkg/msgs/xbot_msgs"
	"math"
	types2 "github.com/cedbossneo/openmower-gui/pkg/types"
	"github.com/paulmach/orb"
	"github.com/paulmach/orb/simplify"
	"github.com/samber/lo"
	"github.com/sirupsen/logrus"
	"golang.org/x/xerrors"
	"sync"
	"time"
)

type RosSubscriber struct {
	Topic       string
	Id          string
	mtx         *sync.Mutex
	cb          func(msg []byte)
	nextMessage []byte
	close       chan bool
}

func NewRosSubscriber(topic, id string, cb func(msg []byte)) *RosSubscriber {
	r := &RosSubscriber{
		cb:    cb,
		Topic: topic,
		Id:    id,
		mtx:   &sync.Mutex{},
		close: make(chan bool),
	}
	go r.Run()
	return r
}

func (r *RosSubscriber) Publish(msg []byte) {
	r.mtx.Lock()
	defer r.mtx.Unlock()
	r.nextMessage = msg
}

func (r *RosSubscriber) Close() {
	r.close <- true
}

func (r *RosSubscriber) Run() {
	for {
		select {
		case <-r.close:
			return
		default:
			r.mtx.Lock()
			messageToProcess := r.nextMessage
			r.nextMessage = nil
			r.mtx.Unlock()
			r.processMessage(messageToProcess)
		}
	}
}

func (r *RosSubscriber) processMessage(messageToProcess []byte) {
	if messageToProcess != nil {
		r.cb(messageToProcess)
	} else {
		time.Sleep(100 * time.Millisecond)
	}
}

type RosProvider struct {
	node                      *goroslib.Node
	mtx                       sync.Mutex
	statusSubscriber          *goroslib.Subscriber
	powerSubscriber           *goroslib.Subscriber
	leftEscSubscriber         *goroslib.Subscriber
	rightEscSubscriber        *goroslib.Subscriber
	highLevelStatusSubscriber *goroslib.Subscriber
	gpsSubscriber             *goroslib.Subscriber
	imuSubscriber             *goroslib.Subscriber
	ticksSubscriber           *goroslib.Subscriber
	mapSubscriber             *goroslib.Subscriber
	pathSubscriber            *goroslib.Subscriber
	currentPathSubscriber     *goroslib.Subscriber
	poseSubscriber            *goroslib.Subscriber
	mowerLogicParamsSubscriber *goroslib.Subscriber
	stallBreakerParamsSubscriber *goroslib.Subscriber
	wifiIfaceSubscriber       *goroslib.Subscriber
	wifiDbmSubscriber         *goroslib.Subscriber
	wifiPercentSubscriber     *goroslib.Subscriber
	loadRatioSubscriber       *goroslib.Subscriber
	rpmSagRatioSubscriber     *goroslib.Subscriber
	wifiStatus                wifiStatus
	subscribers               map[string]map[string]*RosSubscriber
	publishers                map[string]*goroslib.Publisher
	lastMessage               map[string][]byte
	lastMessageAt             map[string]time.Time
	nodeCreatedAt             time.Time
	combinedStatus            mower_msgs.CombinedStatus
	mowingPaths               []*nav_msgs.Path
	mowingPath                *nav_msgs.Path
	mowingPathOrigin          orb.LineString
	dbProvider                types2.IDBProvider
}

func (p *RosProvider) getNode() (*goroslib.Node, error) {
	var err error
	p.mtx.Lock()
	defer p.mtx.Unlock()
	if p.node != nil {
		return p.node, err
	}

	nodeName, err := p.dbProvider.Get("system.ros.nodeName")
	if err != nil {
		return nil, err
	}
	masterUri, err := p.dbProvider.Get("system.ros.masterUri")
	if err != nil {
		return nil, err
	}
	nodeHost, err := p.dbProvider.Get("system.ros.nodeHost")
	if err != nil {
		return nil, err
	}
	p.node, err = goroslib.NewNode(goroslib.NodeConf{
		Name:          string(nodeName),
		MasterAddress: string(masterUri),
		Host:          string(nodeHost),
		ReadTimeout:   time.Minute,
		WriteTimeout:  time.Minute,
	})
	if err == nil && p.node != nil {
		p.nodeCreatedAt = time.Now()
	}
	return p.node, err

}

func NewRosProvider(dbProvider types2.IDBProvider) types2.IRosProvider {
	r := &RosProvider{
		dbProvider: dbProvider,
	}
	// Start the watchdog FIRST and unconditionally. Initial setup may fail
	// when rosmaster isn't reachable yet at boot (network race) — without
	// the watchdog, recovery would never happen for the lifetime of the
	// process. The watchdog itself calls getNode + initSubscribers on every
	// tick, so it self-heals from a dead-on-arrival state too.
	go r.watchdogLoop()

	if err := r.initSubscribers(); err != nil {
		logrus.Warnf("initial subscriber setup failed (watchdog will retry): %v", err)
	}
	if err := r.initMowingPathSubscriber(); err != nil {
		logrus.Warnf("initial mowing path subscriber setup failed (watchdog will retry): %v", err)
	}
	// Pre-warm the action publisher so the first user action (Skip Points,
	// Skip Path, Skip Area) isn't lost to the goroslib subscriber-handshake
	// race. Without this, the first Write after NewPublisher fires before
	// mower_logic has completed its TCP connect, and the message is dropped.
	if _, err := r.Publisher("/xbot/action", &std_msgs.String{}); err != nil {
		logrus.Warnf("failed to pre-warm /xbot/action publisher: %v", err)
	} else {
		logrus.Info("Pre-warmed /xbot/action publisher")
	}
	return r
}

// Watchdog timings — vars (not consts) so tests can shrink them if needed.
var (
	watchdogTick   = 20 * time.Second
	staleThreshold = 45 * time.Second
	bootGrace      = 45 * time.Second
)

// Always-on topics used as the freshness signal. Both are published whenever
// the low-level ROS stack is up (mower status at ~10Hz, power at ~2Hz).
const (
	freshnessTopicStatus = "/ll/mower_status"
	freshnessTopicPower  = "/ll/power"
)

// shouldResetForStaleness decides whether the watchdog should tear down the
// ROS node based on message-flow staleness alone. `nodeCreatedAt.IsZero()`
// means no node has been created yet (boot not complete); we never reset in
// that case. A zero `statusAt`/`powerAt` is treated as "infinitely stale",
// which together with the `bootGrace` gate gives the node time to start
// receiving before we trip.
func shouldResetForStaleness(now, nodeCreatedAt, statusAt, powerAt time.Time) bool {
	if nodeCreatedAt.IsZero() {
		return false
	}
	if now.Sub(nodeCreatedAt) <= bootGrace {
		return false
	}
	statusStale := statusAt.IsZero() || now.Sub(statusAt) > staleThreshold
	powerStale := powerAt.IsZero() || now.Sub(powerAt) > staleThreshold
	return statusStale && powerStale
}

func (r *RosProvider) watchdogLoop() {
	for range time.Tick(watchdogTick) {
		node, err := r.getNode()
		if err != nil {
			logrus.Error(xerrors.Errorf("failed to get node: %w", err))
			continue
		}
		_, pingErr := node.NodePing("rosout")

		r.mtx.Lock()
		nodeCreatedAt := r.nodeCreatedAt
		statusAt := r.lastMessageAt[freshnessTopicStatus]
		powerAt := r.lastMessageAt[freshnessTopicPower]
		r.mtx.Unlock()

		stale := shouldResetForStaleness(time.Now(), nodeCreatedAt, statusAt, powerAt)

		if pingErr != nil || stale {
			reason := ""
			switch {
			case pingErr != nil && stale:
				reason = "rosout ping failed and status/power silent"
			case pingErr != nil:
				reason = "rosout ping failed"
			default:
				reason = "status+power silent past threshold (ping ok, stale publisher URLs)"
			}
			logrus.Warnf("ros watchdog: resetting subscribers: %s", reason)
			r.resetSubscribers()
			// Fall through to re-init immediately instead of waiting 20s for
			// the next tick — otherwise user actions in that window race the
			// publisher handshake on the freshly-created node.
		}

		if err := r.initSubscribers(); err != nil {
			logrus.Error(xerrors.Errorf("failed to init subscribers: %w", err))
		}
		if err := r.initMowingPathSubscriber(); err != nil {
			logrus.Error(xerrors.Errorf("failed to init mowing path subscriber: %w", err))
		}
		// Re-warm action publisher: after resetSubscribers wiped the cache,
		// the first user click would otherwise race the subscriber handshake
		// and drop the message.
		if _, err := r.Publisher("/xbot/action", &std_msgs.String{}); err != nil {
			logrus.Warnf("failed to re-warm /xbot/action publisher: %v", err)
		}
	}
}

func (p *RosProvider) resetSubscribers() {
	// Cached publishers become invalid once their node is closed — Write on a
	// dead publisher silently drops. Clear the map so the next Publisher()
	// call creates a fresh registration against the new node.
	p.mtx.Lock()
	p.publishers = nil
	p.mtx.Unlock()
	if p.node != nil {
		p.node.Close()
	}
	if p.currentPathSubscriber != nil {
		p.currentPathSubscriber.Close()
	}
	if p.gpsSubscriber != nil {
		p.gpsSubscriber.Close()
	}
	if p.highLevelStatusSubscriber != nil {
		p.highLevelStatusSubscriber.Close()
	}
	if p.imuSubscriber != nil {
		p.imuSubscriber.Close()
	}
	if p.mapSubscriber != nil {
		p.mapSubscriber.Close()
	}
	if p.pathSubscriber != nil {
		p.pathSubscriber.Close()
	}
	if p.statusSubscriber != nil {
		p.statusSubscriber.Close()
	}
	if p.powerSubscriber != nil {
		p.powerSubscriber.Close()
	}
	if p.leftEscSubscriber != nil {
		p.leftEscSubscriber.Close()
	}
	if p.rightEscSubscriber != nil {
		p.rightEscSubscriber.Close()
	}
	if p.ticksSubscriber != nil {
		p.ticksSubscriber.Close()
	}
	if p.poseSubscriber != nil {
		p.poseSubscriber.Close()
	}
	if p.mowerLogicParamsSubscriber != nil {
		p.mowerLogicParamsSubscriber.Close()
	}
	if p.stallBreakerParamsSubscriber != nil {
		p.stallBreakerParamsSubscriber.Close()
	}
	if p.wifiIfaceSubscriber != nil {
		p.wifiIfaceSubscriber.Close()
	}
	if p.wifiDbmSubscriber != nil {
		p.wifiDbmSubscriber.Close()
	}
	if p.wifiPercentSubscriber != nil {
		p.wifiPercentSubscriber.Close()
	}
	if p.loadRatioSubscriber != nil {
		p.loadRatioSubscriber.Close()
	}
	if p.rpmSagRatioSubscriber != nil {
		p.rpmSagRatioSubscriber.Close()
	}
	p.node = nil
	p.nodeCreatedAt = time.Time{}
	p.currentPathSubscriber = nil
	p.gpsSubscriber = nil
	p.highLevelStatusSubscriber = nil
	p.imuSubscriber = nil
	p.mapSubscriber = nil
	p.pathSubscriber = nil
	p.statusSubscriber = nil
	p.powerSubscriber = nil
	p.leftEscSubscriber = nil
	p.rightEscSubscriber = nil
	p.ticksSubscriber = nil
	p.poseSubscriber = nil
	p.mowerLogicParamsSubscriber = nil
	p.stallBreakerParamsSubscriber = nil
	p.wifiIfaceSubscriber = nil
	p.wifiDbmSubscriber = nil
	p.wifiPercentSubscriber = nil
	p.loadRatioSubscriber = nil
	p.rpmSagRatioSubscriber = nil
	p.wifiStatus = wifiStatus{}
	p.mowingPaths = []*nav_msgs.Path{}
	p.mowingPath = nil
	p.mowingPathOrigin = nil
	// Drop cached last-message bytes and timestamps so the staleness check
	// starts fresh and new subscribers don't get replayed stale data from
	// before the reset. The external RosSubscriber wrappers in `p.subscribers`
	// are pure in-process buffers with no network state, so we leave them
	// alone — they'll resume delivery once the new goroslib.Subscribers come
	// back up and start pumping messages through cbHandler.
	p.lastMessage = map[string][]byte{}
	p.lastMessageAt = map[string]time.Time{}
}

func (p *RosProvider) initMowingPathSubscriber() error {
	err := p.Subscribe("/xbot_positioning/xb_pose", "gui", func(msg []byte) {
		p.mtx.Lock()
		defer p.mtx.Unlock()
		var pose xbot_msgs.AbsolutePose
		err := json.Unmarshal(msg, &pose)
		if err != nil {
			logrus.Error(xerrors.Errorf("failed to unmarshal pose: %w", err))
			return
		}
		hlsLastMessage, ok := p.lastMessage["/mower_logic/current_state"]
		if ok {
			var highLevelStatus mower_msgs.HighLevelStatus
			err := json.Unmarshal(hlsLastMessage, &highLevelStatus)
			if err != nil {
				logrus.Error(xerrors.Errorf("failed to unmarshal high level status: %w", err))
				return
			}
			switch highLevelStatus.StateName {
			case "MOWING":
				sLastMessage, ok := p.lastMessage["/mower/status"]
				if ok {
					var status mower_msgs.CombinedStatus
					err := json.Unmarshal(sLastMessage, &status)
					if err != nil {
						logrus.Error(xerrors.Errorf("failed to unmarshal status: %w", err))
						return
					}
					if status.MowEscStatus.Tacho > 0 {
						if p.mowingPath == nil {
							p.mowingPath = &nav_msgs.Path{}
							p.mowingPathOrigin = orb.LineString{}
							p.mowingPaths = append(p.mowingPaths, p.mowingPath)
						}
						p.mowingPathOrigin = append(p.mowingPathOrigin, orb.Point{
							pose.Pose.Pose.Position.X, pose.Pose.Pose.Position.Y,
						})
						if len(p.mowingPathOrigin)%5 == 0 {
							// low threshold just removes the colinear point
							reduced := simplify.DouglasPeucker(0.03).LineString(p.mowingPathOrigin.Clone())
							p.mowingPath.Poses = lo.Map(reduced, func(p orb.Point, idx int) geometry_msgs.PoseStamped {
								return geometry_msgs.PoseStamped{
									Pose: geometry_msgs.Pose{
										Position: geometry_msgs.Point{
											X: p[0],
											Y: p[1],
										},
									},
								}
							})
						}
						msgJson, _ := json.Marshal(p.mowingPaths)
						p.lastMessage["/mowing_path"] = msgJson
						subscribers, hasSubscriber := p.subscribers["/mowing_path"]
						if hasSubscriber {
							for _, cb := range subscribers {
								cb.Publish(msgJson)
							}
						}
					} else {
						p.mowingPath = nil
						p.mowingPathOrigin = nil
					}
				}
				break
			default:
				p.mowingPaths = []*nav_msgs.Path{}
				p.mowingPath = nil
				p.mowingPathOrigin = nil
			}
		}
	})
	return err
}

func (p *RosProvider) CallService(ctx context.Context, srvName string, srv any, req any, res any) error {
	rosNode, err := p.getNode()
	if err != nil {
		return err
	}
	serviceClient, err := goroslib.NewServiceClient(goroslib.ServiceClientConf{
		Node: rosNode,
		Name: srvName,
		Srv:  srv,
	})
	err = serviceClient.CallContext(ctx, req, res)
	if err != nil {
		return err
	}
	return nil
}

func (p *RosProvider) Subscribe(topic string, id string, cb func(msg []byte)) error {
	err := p.initSubscribers()
	if err != nil {
		return err
	}
	p.mtx.Lock()
	defer p.mtx.Unlock()
	subscriber, hasSubscriber := p.subscribers[topic]
	if !hasSubscriber {
		p.subscribers[topic] = make(map[string]*RosSubscriber)
		subscriber, _ = p.subscribers[topic]
	}
	_, hasCallback := subscriber[id]
	if !hasCallback {
		subscriber[id] = NewRosSubscriber(topic, id, cb)
	}
	lastMessage, hasLastMessage := p.lastMessage[topic]
	if hasLastMessage {
		subscriber[id].Publish(lastMessage)
	}
	return nil
}

// Publisher returns a cached publisher for the given topic, creating it on
// first use. goroslib refuses a second NewPublisher for a topic already
// registered on the node — and Close leaves registration behind long enough
// that per-request create/close cycles error out with "Topic already
// published". Caching gives the publisher a lifetime tied to the provider
// instead of the HTTP request, and lets concurrent WS sessions share it.
func (p *RosProvider) Publisher(topic string, obj interface{}) (*goroslib.Publisher, error) {
	rosNode, err := p.getNode()
	if err != nil {
		return nil, err
	}
	p.mtx.Lock()
	defer p.mtx.Unlock()
	if p.publishers == nil {
		p.publishers = make(map[string]*goroslib.Publisher)
	}
	if pub, ok := p.publishers[topic]; ok {
		return pub, nil
	}
	publisher, err := goroslib.NewPublisher(goroslib.PublisherConf{
		Node:  rosNode,
		Topic: topic,
		Msg:   obj,
	})
	if err != nil {
		return nil, err
	}
	p.publishers[topic] = publisher
	return publisher, nil
}

func (p *RosProvider) UnSubscribe(topic string, id string) {
	p.mtx.Lock()
	defer p.mtx.Unlock()
	_, hasSubscriber := p.subscribers[topic][id]
	if hasSubscriber {
		p.subscribers[topic][id].Close()
		delete(p.subscribers[topic], id)
	}
}

// publishCombinedStatus serializes the aggregated combinedStatus and publishes
// it under the virtual "/mower/status" topic so the frontend receives a single
// JSON object with all fields it expects.
func (p *RosProvider) publishCombinedStatus() {
	msgJson, err := json.Marshal(p.combinedStatus)
	if err != nil {
		logrus.Error(xerrors.Errorf("failed to marshal combined status: %w", err))
		return
	}
	p.lastMessage["/mower/status"] = msgJson
	subscribers, hasSubscriber := p.subscribers["/mower/status"]
	if hasSubscriber {
		for _, cb := range subscribers {
			cb.Publish(msgJson)
		}
	}
}

func (p *RosProvider) initSubscribers() error {
	node, err := p.getNode()
	if err != nil {
		return err
	}
	if p.subscribers == nil {
		p.subscribers = make(map[string]map[string]*RosSubscriber)
	}
	if p.lastMessage == nil {
		p.lastMessage = make(map[string][]byte)
	}
	if p.lastMessageAt == nil {
		p.lastMessageAt = make(map[string]time.Time)
	}
	if p.statusSubscriber == nil {
		p.statusSubscriber, err = goroslib.NewSubscriber(goroslib.SubscriberConf{
			Node:  node,
			Topic: "/ll/mower_status",
			Callback: func(msg *mower_msgs.Status) {
				p.mtx.Lock()
				defer p.mtx.Unlock()
				p.lastMessageAt["/ll/mower_status"] = time.Now()
				p.combinedStatus.Stamp = msg.Stamp
				p.combinedStatus.MowerStatus = msg.MowerStatus
				p.combinedStatus.RaspberryPiPower = msg.RaspberryPiPower
				p.combinedStatus.EscPower = msg.EscPower
				p.combinedStatus.RainDetected = msg.RainDetected
				p.combinedStatus.SoundModuleAvailable = msg.SoundModuleAvailable
				p.combinedStatus.SoundModuleBusy = msg.SoundModuleBusy
				p.combinedStatus.UiBoardAvailable = msg.UiBoardAvailable
				p.combinedStatus.MowEnabled = msg.MowEnabled
				p.combinedStatus.MowEscStatus.Status = msg.MowerEscStatus
				p.combinedStatus.MowEscStatus.TemperaturePcb = msg.MowerEscTemperature
				p.combinedStatus.MowEscStatus.Current = msg.MowerEscCurrent
				p.combinedStatus.MowEscStatus.TemperatureMotor = msg.MowerMotorTemperature
				p.combinedStatus.MowEscStatus.Rpm = int16(msg.MowerMotorRpm)
				p.publishCombinedStatus()
			},
			QueueSize: 1,
		})
		logrus.Info("Subscribed to /ll/mower_status")
	}
	if p.powerSubscriber == nil {
		p.powerSubscriber, err = goroslib.NewSubscriber(goroslib.SubscriberConf{
			Node:  node,
			Topic: "/ll/power",
			Callback: func(msg *mower_msgs.Power) {
				p.mtx.Lock()
				defer p.mtx.Unlock()
				p.lastMessageAt["/ll/power"] = time.Now()
				p.combinedStatus.VCharge = msg.VCharge
				p.combinedStatus.VBattery = msg.VBattery
				p.combinedStatus.ChargeCurrent = msg.ChargeCurrent
				p.publishCombinedStatus()
			},
			QueueSize: 1,
		})
		logrus.Info("Subscribed to /ll/power")
	}
	if p.leftEscSubscriber == nil {
		p.leftEscSubscriber, err = goroslib.NewSubscriber(goroslib.SubscriberConf{
			Node:  node,
			Topic: "/ll/diff_drive/left_esc_status",
			Callback: func(msg *mower_msgs.ESCStatus) {
				p.mtx.Lock()
				defer p.mtx.Unlock()
				p.lastMessageAt["/ll/diff_drive/left_esc_status"] = time.Now()
				p.combinedStatus.LeftEscStatus = *msg
				p.publishCombinedStatus()
			},
			QueueSize: 1,
		})
		logrus.Info("Subscribed to /ll/diff_drive/left_esc_status")
	}
	if p.rightEscSubscriber == nil {
		p.rightEscSubscriber, err = goroslib.NewSubscriber(goroslib.SubscriberConf{
			Node:  node,
			Topic: "/ll/diff_drive/right_esc_status",
			Callback: func(msg *mower_msgs.ESCStatus) {
				p.mtx.Lock()
				defer p.mtx.Unlock()
				p.lastMessageAt["/ll/diff_drive/right_esc_status"] = time.Now()
				p.combinedStatus.RightEscStatus = *msg
				p.publishCombinedStatus()
			},
			QueueSize: 1,
		})
		logrus.Info("Subscribed to /ll/diff_drive/right_esc_status")
	}
	if p.highLevelStatusSubscriber == nil {
		p.highLevelStatusSubscriber, err = goroslib.NewSubscriber(goroslib.SubscriberConf{
			Node:      node,
			Topic:     "/mower_logic/current_state",
			Callback:  cbHandler[*mower_msgs.HighLevelStatus](p, "/mower_logic/current_state"),
			QueueSize: 1,
		})
		logrus.Info("Subscribed to /mower_logic/current_state")
	}
	if p.gpsSubscriber == nil {
		p.gpsSubscriber, err = goroslib.NewSubscriber(goroslib.SubscriberConf{
			Node:      node,
			Topic:     "/ll/position/gps",
			Callback:  cbHandler[*xbot_msgs.AbsolutePose](p, "/xbot_driver_gps/xb_pose"),
			QueueSize: 1,
		})
		logrus.Info("Subscribed to /ll/position/gps (aliased as /xbot_driver_gps/xb_pose)")
	}
	if p.poseSubscriber == nil {
		p.poseSubscriber, err = goroslib.NewSubscriber(goroslib.SubscriberConf{
			Node:      node,
			Topic:     "/xbot_positioning/xb_pose",
			Callback:  cbHandler[*xbot_msgs.AbsolutePose](p, "/xbot_positioning/xb_pose"),
			QueueSize: 1,
		})
		logrus.Info("Subscribed to /xbot_positioning/xb_pose")
	}
	if p.imuSubscriber == nil {
		p.imuSubscriber, err = goroslib.NewSubscriber(goroslib.SubscriberConf{
			Node:      node,
			Topic:     "/ll/imu/data_raw",
			Callback:  cbHandler[*sensor_msgs.Imu](p, "/imu/data_raw"),
			QueueSize: 1,
		})
		logrus.Info("Subscribed to /ll/imu/data_raw (aliased as /imu/data_raw)")
	}
	if p.ticksSubscriber == nil {
		p.ticksSubscriber, err = goroslib.NewSubscriber(goroslib.SubscriberConf{
			Node:      node,
			Topic:     "/mower/wheel_ticks",
			Callback:  cbHandler[*xbot_msgs.WheelTick](p, "/mower/wheel_ticks"),
			QueueSize: 1,
		})
		logrus.Info("Subscribed to /mower/wheel_ticks")
	}
	if p.mapSubscriber == nil {
		p.mapSubscriber, err = goroslib.NewSubscriber(goroslib.SubscriberConf{
			Node:      node,
			Topic:     "/mower_map_service/json_map",
			Callback:  p.jsonMapHandler,
			QueueSize: 1,
		})
		logrus.Info("Subscribed to /mower_map_service/json_map")
	}
	if p.pathSubscriber == nil {
		p.pathSubscriber, err = goroslib.NewSubscriber(goroslib.SubscriberConf{
			Node:      node,
			Topic:     "/slic3r_coverage_planner/path_marker_array",
			Callback:  cbHandler[*visualization_msgs.MarkerArray](p, "/slic3r_coverage_planner/path_marker_array"),
			QueueSize: 1,
		})
		logrus.Info("Subscribed to /slic3r_coverage_planner/path_marker_array")
	}
	if p.currentPathSubscriber == nil {
		p.currentPathSubscriber, err = goroslib.NewSubscriber(goroslib.SubscriberConf{
			Node:      node,
			Topic:     "/move_base_flex/FTCPlanner/global_plan",
			Callback:  cbHandler[*nav_msgs.Path](p, "/move_base_flex/FTCPlanner/global_plan"),
			QueueSize: 1,
		})
		logrus.Info("Subscribed to /move_base_flex/FTCPlanner/global_plan")
	}
	if p.mowerLogicParamsSubscriber == nil {
		p.mowerLogicParamsSubscriber, err = goroslib.NewSubscriber(goroslib.SubscriberConf{
			Node:      node,
			Topic:     "/mower_logic/parameter_updates",
			Callback:  cbHandler[*dynamic_reconfigure.Config](p, "/mower_logic/parameter_updates"),
			QueueSize: 1,
		})
		logrus.Info("Subscribed to /mower_logic/parameter_updates")
	}
	if p.stallBreakerParamsSubscriber == nil {
		p.stallBreakerParamsSubscriber, err = goroslib.NewSubscriber(goroslib.SubscriberConf{
			Node:      node,
			Topic:     "/ll/stall_breaker/parameter_updates",
			Callback:  cbHandler[*dynamic_reconfigure.Config](p, "/ll/stall_breaker/parameter_updates"),
			QueueSize: 1,
		})
		logrus.Info("Subscribed to /ll/stall_breaker/parameter_updates")
	}
	if p.wifiIfaceSubscriber == nil {
		rawTopic := "/xbot_monitoring/sensors/om_wifi_iface/data"
		raw := cbHandler[*xbot_msgs.SensorDataString](p, rawTopic)
		p.wifiIfaceSubscriber, err = goroslib.NewSubscriber(goroslib.SubscriberConf{
			Node:  node,
			Topic: rawTopic,
			Callback: func(msg *xbot_msgs.SensorDataString) {
				raw(msg)
				p.mtx.Lock()
				defer p.mtx.Unlock()
				v := msg.Data
				p.wifiStatus.Iface = &v
				p.publishWifiStatus()
			},
			QueueSize: 1,
		})
		logrus.Info("Subscribed to " + rawTopic)
	}
	if p.wifiDbmSubscriber == nil {
		rawTopic := "/xbot_monitoring/sensors/om_wifi_signal_dbm/data"
		raw := cbHandler[*xbot_msgs.SensorDataDouble](p, rawTopic)
		p.wifiDbmSubscriber, err = goroslib.NewSubscriber(goroslib.SubscriberConf{
			Node:  node,
			Topic: rawTopic,
			Callback: func(msg *xbot_msgs.SensorDataDouble) {
				raw(msg)
				p.mtx.Lock()
				defer p.mtx.Unlock()
				v := msg.Data
				p.wifiStatus.SignalDbm = &v
				p.publishWifiStatus()
			},
			QueueSize: 1,
		})
		logrus.Info("Subscribed to " + rawTopic)
	}
	if p.wifiPercentSubscriber == nil {
		rawTopic := "/xbot_monitoring/sensors/om_wifi_signal_percent/data"
		raw := cbHandler[*xbot_msgs.SensorDataDouble](p, rawTopic)
		p.wifiPercentSubscriber, err = goroslib.NewSubscriber(goroslib.SubscriberConf{
			Node:  node,
			Topic: rawTopic,
			Callback: func(msg *xbot_msgs.SensorDataDouble) {
				raw(msg)
				p.mtx.Lock()
				defer p.mtx.Unlock()
				v := msg.Data
				p.wifiStatus.SignalPercent = &v
				p.publishWifiStatus()
			},
			QueueSize: 1,
		})
		logrus.Info("Subscribed to " + rawTopic)
	}
	if p.loadRatioSubscriber == nil {
		rawTopic := "/blade_speed_adapter/load_ratio"
		p.loadRatioSubscriber, err = goroslib.NewSubscriber(goroslib.SubscriberConf{
			Node:      node,
			Topic:     rawTopic,
			Callback:  cbHandler[*std_msgs.Float32](p, rawTopic),
			QueueSize: 1,
		})
		logrus.Info("Subscribed to " + rawTopic)
	}
	if p.rpmSagRatioSubscriber == nil {
		rawTopic := "/blade_speed_adapter/rpm_sag_ratio"
		p.rpmSagRatioSubscriber, err = goroslib.NewSubscriber(goroslib.SubscriberConf{
			Node:      node,
			Topic:     rawTopic,
			Callback:  cbHandler[*std_msgs.Float32](p, rawTopic),
			QueueSize: 1,
		})
		logrus.Info("Subscribed to " + rawTopic)
	}
	return nil
}

// wifiStatus is the aggregated WiFi state republished on the synthetic
// "/wifi" topic. Sources: xbot_monitoring sensor publications, each one
// ~1Hz. Fields are optional pointers so the frontend can distinguish
// "never seen" from "zero".
type wifiStatus struct {
	Iface         *string  `json:"iface,omitempty"`
	SignalDbm     *float64 `json:"signalDbm,omitempty"`
	SignalPercent *float64 `json:"signalPercent,omitempty"`
}

const wifiVirtualTopic = "/wifi"

// publishWifiStatus marshals p.wifiStatus and stores/fans-out on the
// virtual "/wifi" topic. Caller must hold p.mtx.
func (p *RosProvider) publishWifiStatus() {
	msgJson, err := json.Marshal(p.wifiStatus)
	if err != nil {
		logrus.Error(xerrors.Errorf("failed to marshal wifi status: %w", err))
		return
	}
	p.lastMessage[wifiVirtualTopic] = msgJson
	p.lastMessageAt[wifiVirtualTopic] = time.Now()
	if subs, ok := p.subscribers[wifiVirtualTopic]; ok {
		for _, cb := range subs {
			cb.Publish(msgJson)
		}
	}
}

func cbHandler[T any](p *RosProvider, topic string) func(msg T) {
	return func(msg T) {
		p.mtx.Lock()
		defer p.mtx.Unlock()
		msgJson, err := json.Marshal(msg)
		if err != nil {
			logrus.Error(xerrors.Errorf("failed to marshal message: %w", err))
			return
		}
		p.lastMessage[topic] = msgJson
		p.lastMessageAt[topic] = time.Now()
		subscribers, hasSubscriber := p.subscribers[topic]
		if hasSubscriber {
			for _, cb := range subscribers {
				cb.Publish(msgJson)
			}
		}
	}
}

// jsonMapPoint represents a point in the JSON map format
type jsonMapPoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// jsonMapArea represents an area in the JSON map format
type jsonMapArea struct {
	ID         string            `json:"id"`
	Properties map[string]interface{} `json:"properties"`
	Outline    []jsonMapPoint    `json:"outline"`
}

// jsonDockingStation represents a docking station in the JSON map format
type jsonDockingStation struct {
	ID         string            `json:"id"`
	Properties map[string]interface{} `json:"properties"`
	Position   jsonMapPoint      `json:"position"`
	Heading    float64           `json:"heading"`
}

// jsonMapData represents the full JSON map from mower_map_service
type jsonMapData struct {
	Areas           []jsonMapArea        `json:"areas"`
	DockingStations []jsonDockingStation `json:"docking_stations"`
}

// pointInPolygon checks if a point is inside a polygon using ray casting.
func pointInPolygon(pt jsonMapPoint, polygon []geometry_msgs.Point32) bool {
	n := len(polygon)
	if n < 3 {
		return false
	}
	inside := false
	j := n - 1
	for i := 0; i < n; i++ {
		xi, yi := float64(polygon[i].X), float64(polygon[i].Y)
		xj, yj := float64(polygon[j].X), float64(polygon[j].Y)
		if ((yi > pt.Y) != (yj > pt.Y)) &&
			(pt.X < (xj-xi)*(pt.Y-yi)/(yj-yi)+xi) {
			inside = !inside
		}
		j = i
	}
	return inside
}

func (p *RosProvider) jsonMapHandler(msg *std_msgs.String) {
	var mapData jsonMapData
	if err := json.Unmarshal([]byte(msg.Data), &mapData); err != nil {
		logrus.Error(xerrors.Errorf("failed to parse JSON map: %w", err))
		return
	}

	// Convert to xbot_msgs.Map format
	var result xbot_msgs.Map

	// Calculate map bounds
	minX, minY := math.MaxFloat64, math.MaxFloat64
	maxX, maxY := -math.MaxFloat64, -math.MaxFloat64

	// First pass: separate mow/nav areas from obstacles
	type obstacleEntry struct {
		points   []geometry_msgs.Point32
		centroid jsonMapPoint
	}
	var obstacles []obstacleEntry

	for _, area := range mapData.Areas {
		areaType, _ := area.Properties["type"].(string)

		points := make([]geometry_msgs.Point32, 0, len(area.Outline))
		for _, pt := range area.Outline {
			points = append(points, geometry_msgs.Point32{
				X: float32(pt.X), Y: float32(pt.Y), Z: 0,
			})
			if pt.X < minX { minX = pt.X }
			if pt.X > maxX { maxX = pt.X }
			if pt.Y < minY { minY = pt.Y }
			if pt.Y > maxY { maxY = pt.Y }
		}

		if areaType == "obstacle" {
			// Compute centroid for later assignment
			var cx, cy float64
			for _, pt := range area.Outline {
				cx += pt.X
				cy += pt.Y
			}
			if len(area.Outline) > 0 {
				cx /= float64(len(area.Outline))
				cy /= float64(len(area.Outline))
			}
			obstacles = append(obstacles, obstacleEntry{
				points:   points,
				centroid: jsonMapPoint{X: cx, Y: cy},
			})
			continue
		}

		var mapArea xbot_msgs.MapArea
		if name, ok := area.Properties["name"].(string); ok {
			mapArea.Name = name
		}
		mapArea.Area.Points = points

		if areaType == "navigation" || areaType == "nav" {
			result.NavigationAreas = append(result.NavigationAreas, mapArea)
		} else {
			result.WorkingArea = append(result.WorkingArea, mapArea)
		}
	}

	// Second pass: assign each obstacle to the nearest mow area
	for _, obs := range obstacles {
		bestIdx := 0
		bestDist := math.MaxFloat64
		for i, wa := range result.WorkingArea {
			if pointInPolygon(obs.centroid, wa.Area.Points) {
				bestIdx = i
				bestDist = -1
				break
			}
			// Fallback: distance to polygon centroid
			var cx, cy float64
			for _, pt := range wa.Area.Points {
				cx += float64(pt.X)
				cy += float64(pt.Y)
			}
			if len(wa.Area.Points) > 0 {
				cx /= float64(len(wa.Area.Points))
				cy /= float64(len(wa.Area.Points))
			}
			dx := obs.centroid.X - cx
			dy := obs.centroid.Y - cy
			dist := dx*dx + dy*dy
			if dist < bestDist {
				bestDist = dist
				bestIdx = i
			}
		}
		if len(result.WorkingArea) > 0 {
			result.WorkingArea[bestIdx].Obstacles = append(
				result.WorkingArea[bestIdx].Obstacles,
				geometry_msgs.Polygon{Points: obs.points},
			)
		}
	}

	if minX != math.MaxFloat64 {
		result.MapWidth = maxX - minX
		result.MapHeight = maxY - minY
		result.MapCenterX = (minX + maxX) / 2
		result.MapCenterY = (minY + maxY) / 2
	}

	if len(mapData.DockingStations) > 0 {
		dock := mapData.DockingStations[0]
		result.DockX = dock.Position.X
		result.DockY = dock.Position.Y
		result.DockHeading = dock.Heading
	}

	// Publish as the topic the GUI expects
	const topic = "/xbot_monitoring/map"
	p.mtx.Lock()
	defer p.mtx.Unlock()
	msgJson, err := json.Marshal(result)
	if err != nil {
		logrus.Error(xerrors.Errorf("failed to marshal map: %w", err))
		return
	}
	p.lastMessage[topic] = msgJson
	p.lastMessageAt["/mower_map_service/json_map"] = time.Now()
	subscribers, hasSubscriber := p.subscribers[topic]
	if hasSubscriber {
		for _, cb := range subscribers {
			cb.Publish(msgJson)
		}
	}
}
