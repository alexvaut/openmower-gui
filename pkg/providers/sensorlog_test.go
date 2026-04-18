package providers

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/bluenviron/goroslib/v2"
	"github.com/stretchr/testify/assert"
)

// fakeRosProvider is an inline test double for types.IRosProvider.
// Subscribe/UnSubscribe calls are recorded under a mutex; Subscribe can be
// configured to fail the first N calls (per topic+id pair) before succeeding.
type fakeRosProvider struct {
	mu           sync.Mutex
	subCalls     []subCall
	unsubCalls   []unsubCall
	failNext     map[string]int              // key "topic|id" -> remaining errors
	captured     map[string]func([]byte)     // latest cb per "topic|id"
}

type subCall struct {
	topic string
	id    string
}

type unsubCall struct {
	topic string
	id    string
}

func newFakeRos() *fakeRosProvider {
	return &fakeRosProvider{
		failNext: map[string]int{},
		captured: map[string]func([]byte){},
	}
}

func (f *fakeRosProvider) Subscribe(topic, id string, cb func(msg []byte)) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	key := topic + "|" + id
	f.subCalls = append(f.subCalls, subCall{topic, id})
	if n := f.failNext[key]; n > 0 {
		f.failNext[key] = n - 1
		return errors.New("fake: subscribe unavailable")
	}
	f.captured[key] = cb
	return nil
}

func (f *fakeRosProvider) UnSubscribe(topic, id string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.unsubCalls = append(f.unsubCalls, unsubCall{topic, id})
}

func (f *fakeRosProvider) CallService(_ context.Context, _ string, _, _, _ any) error {
	return nil
}

func (f *fakeRosProvider) Publisher(_ string, _ interface{}) (*goroslib.Publisher, error) {
	return nil, nil
}

func (f *fakeRosProvider) setFailCount(topic, id string, n int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.failNext[topic+"|"+id] = n
}

func (f *fakeRosProvider) subscribeCount(topic, id string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	n := 0
	for _, c := range f.subCalls {
		if c.topic == topic && c.id == id {
			n++
		}
	}
	return n
}

func (f *fakeRosProvider) unsubscribeCount(topic, id string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	n := 0
	for _, c := range f.unsubCalls {
		if c.topic == topic && c.id == id {
			n++
		}
	}
	return n
}

// newBareProvider returns a SensorLogProvider with just enough state to
// exercise the retry/heartbeat/callback logic — no goroutines, no DB.
func newBareProvider() *SensorLogProvider {
	return &SensorLogProvider{stopCh: make(chan struct{})}
}

// TestSubscribeWithRetry_SucceedsAfterFailures: the loop retries after errors
// and exits once Subscribe finally returns nil.
func TestSubscribeWithRetry_SucceedsAfterFailures(t *testing.T) {
	s := newBareProvider()
	fake := newFakeRos()
	fake.setFailCount("/topic", "id", 1) // fail once, then succeed

	done := make(chan struct{})
	go func() {
		s.subscribeWithRetry(fake, "/topic", "id", func([]byte) {})
		close(done)
	}()

	select {
	case <-done:
		// First call errored (1s backoff), second call succeeded.
		assert.Equal(t, 2, fake.subscribeCount("/topic", "id"))
	case <-time.After(5 * time.Second):
		t.Fatal("subscribeWithRetry did not return after one retry")
	}
}

// TestSubscribeWithRetry_StopsOnShutdown: closing stopCh aborts the retry loop
// even when Subscribe keeps failing.
func TestSubscribeWithRetry_StopsOnShutdown(t *testing.T) {
	s := newBareProvider()
	fake := newFakeRos()
	fake.setFailCount("/topic", "id", 1_000_000) // effectively forever

	done := make(chan struct{})
	go func() {
		s.subscribeWithRetry(fake, "/topic", "id", func([]byte) {})
		close(done)
	}()

	// Let the first Subscribe fire and enter the backoff wait.
	time.Sleep(50 * time.Millisecond)
	close(s.stopCh)

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("subscribeWithRetry did not honor stopCh")
	}
}

// TestOnPose_UpdatesFields: pose callback stores position/accuracy.
func TestOnPose_UpdatesFields(t *testing.T) {
	s := newBareProvider()

	payload := `{
		"PositionAccuracy": 0.12,
		"Pose": {"Pose": {"Position": {"X": 1.5, "Y": -2.25}}}
	}`
	s.onPose([]byte(payload))

	s.mu.Lock()
	defer s.mu.Unlock()
	assert.True(t, s.hasPose)
	assert.InDelta(t, 1.5, s.lastPoseX, 1e-9)
	assert.InDelta(t, -2.25, s.lastPoseY, 1e-9)
	assert.InDelta(t, 0.12, float64(s.lastGpsAccuracy), 1e-6)
}

// TestOnPose_ComputesSpeed: two pose callbacks 1m apart over ~100ms yield
// a speed near 10 m/s.
func TestOnPose_ComputesSpeed(t *testing.T) {
	s := newBareProvider()

	poseJSON := func(x, y float64) []byte {
		b, _ := json.Marshal(map[string]any{
			"PositionAccuracy": 0.0,
			"Pose": map[string]any{
				"Pose": map[string]any{
					"Position": map[string]any{"X": x, "Y": y},
				},
			},
		})
		return b
	}

	s.onPose(poseJSON(0, 0))
	time.Sleep(100 * time.Millisecond)
	s.onPose(poseJSON(1, 0))

	s.mu.Lock()
	defer s.mu.Unlock()
	// ~10 m/s, wide tolerance for wall-clock jitter on Windows.
	assert.Greater(t, s.lastSpeed, 3.0)
	assert.Less(t, s.lastSpeed, 30.0)
}

// TestOnMowerStatus_PopulatesFields: the extracted callback writes the
// expected subset of fields onto the provider.
func TestOnMowerStatus_PopulatesFields(t *testing.T) {
	s := newBareProvider()

	payload := `{
		"MowEscStatus":   {"Rpm": 3000, "Current": 1.25, "TemperatureMotor": 55.5, "TemperaturePcb": 40.1},
		"LeftEscStatus":  {"Rpm": 100,  "Current": 0.5,  "TemperatureMotor": 30.0},
		"RightEscStatus": {"Rpm": 110,  "Current": 0.6,  "TemperatureMotor": 31.0},
		"VBattery": 28.4
	}`
	s.onMowerStatus([]byte(payload))

	s.mu.Lock()
	defer s.mu.Unlock()
	assert.True(t, s.hasStatus)
	// float32 round-trip precision — keep tolerance loose.
	const eps = 1e-4
	assert.Equal(t, int16(3000), s.lastMowRpm)
	assert.InDelta(t, 1.25, float64(s.lastMowCurrent), eps)
	assert.InDelta(t, 55.5, float64(s.lastMowTempMot), eps)
	assert.InDelta(t, 40.1, float64(s.lastMowTempPcb), eps)
	assert.Equal(t, int16(100), s.lastLeftRpm)
	assert.Equal(t, int16(110), s.lastRightRpm)
	assert.InDelta(t, 28.4, float64(s.lastVBattery), eps)
}

func TestOnHighLevelState_PopulatesStateName(t *testing.T) {
	s := newBareProvider()

	s.onHighLevelState([]byte(`{"StateName": "MOWING"}`))

	s.mu.Lock()
	defer s.mu.Unlock()
	assert.Equal(t, "MOWING", s.lastStateName)
}

