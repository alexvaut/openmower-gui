package providers

import (
	"database/sql"
	"encoding/json"
	"math"
	"math/rand"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/cedbossneo/openmower-gui/pkg/types"
	"github.com/sirupsen/logrus"
	_ "modernc.org/sqlite"
)

// SensorSampleResult is the compact struct returned by queries.
type SensorSampleResult struct {
	T int64   `json:"t"`
	X float64 `json:"x"`
	Y float64 `json:"y"`
	V float64 `json:"v"`
}

// SensorLogResponse is the JSON response for GET /sensorlog.
type SensorLogResponse struct {
	Samples []SensorSampleResult `json:"samples"`
	Sensor  string               `json:"sensor"`
	Min     float64              `json:"min"`
	Max     float64              `json:"max"`
	Count   int                  `json:"count"`
}

// SensorLogStats is the JSON response for GET /sensorlog/stats.
type SensorLogStats struct {
	TotalSamples    int   `json:"totalSamples"`
	OldestTimestamp int64 `json:"oldestTimestamp"`
	NewestTimestamp int64 `json:"newestTimestamp"`
}

// sensorColumnWhitelist maps query param names to SQL column names.
var sensorColumnWhitelist = map[string]string{
	// Mow motor
	"mow_rpm":        "mow_rpm",
	"mow_current":    "mow_current",
	"mow_temp_motor": "mow_temp_motor",
	"mow_temp_pcb":   "mow_temp_pcb",
	// Left wheel
	"left_rpm":        "left_rpm",
	"left_current":    "left_current",
	"left_temp_motor": "left_temp_motor",
	// Right wheel
	"right_rpm":        "right_rpm",
	"right_current":    "right_current",
	"right_temp_motor": "right_temp_motor",
	// Robot
	"v_battery":     "v_battery",
	"gps_accuracy":  "gps_accuracy",
	"speed": "speed",
}

// SensorLogProvider collects sensor data while mowing and stores it in SQLite.
type SensorLogProvider struct {
	db *sql.DB

	mu            sync.Mutex
	lastStateName string
	hasPose       bool
	hasStatus     bool

	// Pose data
	lastPoseX       float64
	lastPoseY       float64
	lastGpsAccuracy float32
	lastSpeed       float64

	// Previous pose for speed computation (using pose callback timing)
	prevPoseX    float64
	prevPoseY    float64
	prevPoseTime time.Time
	hasPrev      bool

	// Mow motor
	lastMowRpm     int16
	lastMowCurrent float32
	lastMowTempMot float32
	lastMowTempPcb float32

	// Wheel ESCs
	lastLeftRpm      int16
	lastLeftCurrent  float32
	lastLeftTempMot  float32
	lastRightRpm     int16
	lastRightCurrent float32
	lastRightTempMot float32

	// Battery
	lastVBattery float32

	retentionDays int
	stopCh        chan struct{}
}

// combinedStatusSubset extracts the fields we need from the "/mower/status" JSON.
type combinedStatusSubset struct {
	MowEscStatus escSubset `json:"MowEscStatus"`
	LeftEscStatus  escSubset `json:"LeftEscStatus"`
	RightEscStatus escSubset `json:"RightEscStatus"`
	VBattery       float32   `json:"VBattery"`
}

type escSubset struct {
	Rpm              int16   `json:"Rpm"`
	Current          float32 `json:"Current"`
	TemperatureMotor float32 `json:"TemperatureMotor"`
	TemperaturePcb   float32 `json:"TemperaturePcb"`
}

// highLevelStatusSubset extracts StateName from "/mower_logic/current_state" JSON.
type highLevelStatusSubset struct {
	StateName string `json:"StateName"`
}

// absolutePoseSubset extracts position and accuracy from "/xbot_positioning/xb_pose" JSON.
type absolutePoseSubset struct {
	PositionAccuracy float32 `json:"PositionAccuracy"`
	Pose             struct {
		Pose struct {
			Position struct {
				X float64 `json:"X"`
				Y float64 `json:"Y"`
			} `json:"Position"`
		} `json:"Pose"`
	} `json:"Pose"`
}

const createTableSQL = `
CREATE TABLE IF NOT EXISTS sensor_samples (
	id              INTEGER PRIMARY KEY AUTOINCREMENT,
	timestamp       INTEGER NOT NULL,
	x               REAL NOT NULL,
	y               REAL NOT NULL,
	mow_rpm         INTEGER NOT NULL,
	mow_current     REAL NOT NULL,
	mow_temp_motor  REAL NOT NULL,
	mow_temp_pcb    REAL NOT NULL,
	left_rpm        INTEGER NOT NULL DEFAULT 0,
	left_current    REAL NOT NULL DEFAULT 0,
	left_temp_motor REAL NOT NULL DEFAULT 0,
	right_rpm       INTEGER NOT NULL DEFAULT 0,
	right_current   REAL NOT NULL DEFAULT 0,
	right_temp_motor REAL NOT NULL DEFAULT 0,
	v_battery       REAL NOT NULL DEFAULT 0,
	gps_accuracy    REAL NOT NULL DEFAULT 0,
	speed           REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sensor_ts ON sensor_samples(timestamp);
`

// migrateColumns adds columns that may not exist in older databases.
var migrateColumns = []string{
	"left_rpm INTEGER NOT NULL DEFAULT 0",
	"left_current REAL NOT NULL DEFAULT 0",
	"left_temp_motor REAL NOT NULL DEFAULT 0",
	"right_rpm INTEGER NOT NULL DEFAULT 0",
	"right_current REAL NOT NULL DEFAULT 0",
	"right_temp_motor REAL NOT NULL DEFAULT 0",
	"v_battery REAL NOT NULL DEFAULT 0",
	"gps_accuracy REAL NOT NULL DEFAULT 0",
	"speed REAL NOT NULL DEFAULT 0",
}

func NewSensorLogProvider(rosProvider types.IRosProvider, dbPath string) *SensorLogProvider {
	retentionDays := 180
	if envVal := os.Getenv("SENSOR_LOG_RETENTION_DAYS"); envVal != "" {
		if v, err := strconv.Atoi(envVal); err == nil && v > 0 {
			retentionDays = v
		}
	}

	dbFile := dbPath + "/sensorlog.db"
	db, err := sql.Open("sqlite", dbFile)
	if err != nil {
		logrus.Errorf("sensorlog: failed to open SQLite at %s: %v", dbFile, err)
		return nil
	}

	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		logrus.Errorf("sensorlog: failed to set WAL mode: %v", err)
	}

	if _, err := db.Exec(createTableSQL); err != nil {
		logrus.Errorf("sensorlog: failed to create table: %v", err)
	}

	// Migrate: add new columns to existing databases
	for _, colDef := range migrateColumns {
		_, _ = db.Exec("ALTER TABLE sensor_samples ADD COLUMN " + colDef)
	}

	s := &SensorLogProvider{
		db:            db,
		retentionDays: retentionDays,
		stopCh:        make(chan struct{}),
	}

	s.pruneOldData()
	s.subscribeToRos(rosProvider)

	go s.sampleLoop()
	go s.retentionLoop()

	logrus.Infof("sensorlog: initialized (retention=%d days, db=%s)", retentionDays, dbFile)
	return s
}

func (s *SensorLogProvider) subscribeToRos(rosProvider types.IRosProvider) {
	go s.subscribeWithRetry(rosProvider, "/mower/status", "sensorlog-status", s.onMowerStatus)
	go s.subscribeWithRetry(rosProvider, "/mower_logic/current_state", "sensorlog-hls", s.onHighLevelState)
	go s.subscribeWithRetry(rosProvider, "/xbot_positioning/xb_pose", "sensorlog-pose", s.onPose)
}

// subscribeWithRetry keeps attempting rosProvider.Subscribe until it succeeds
// (ROS master may not be reachable at container boot). Subscribe is idempotent
// on (topic, id), so a retry after success is a safe no-op.
func (s *SensorLogProvider) subscribeWithRetry(
	rp types.IRosProvider, topic, id string, cb func([]byte),
) {
	backoff := time.Second
	for {
		if err := rp.Subscribe(topic, id, cb); err == nil {
			logrus.Infof("sensorlog: subscribed to %s", topic)
			return
		}
		select {
		case <-s.stopCh:
			return
		case <-time.After(backoff):
		}
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
}

func (s *SensorLogProvider) onMowerStatus(msg []byte) {
	var status combinedStatusSubset
	if err := json.Unmarshal(msg, &status); err != nil {
		return
	}
	s.mu.Lock()
	s.lastMowRpm = status.MowEscStatus.Rpm
	s.lastMowCurrent = status.MowEscStatus.Current
	s.lastMowTempMot = status.MowEscStatus.TemperatureMotor
	s.lastMowTempPcb = status.MowEscStatus.TemperaturePcb
	s.lastLeftRpm = status.LeftEscStatus.Rpm
	s.lastLeftCurrent = status.LeftEscStatus.Current
	s.lastLeftTempMot = status.LeftEscStatus.TemperatureMotor
	s.lastRightRpm = status.RightEscStatus.Rpm
	s.lastRightCurrent = status.RightEscStatus.Current
	s.lastRightTempMot = status.RightEscStatus.TemperatureMotor
	s.lastVBattery = status.VBattery
	s.hasStatus = true
	s.mu.Unlock()
}

func (s *SensorLogProvider) onHighLevelState(msg []byte) {
	var hls highLevelStatusSubset
	if err := json.Unmarshal(msg, &hls); err != nil {
		return
	}
	s.mu.Lock()
	s.lastStateName = hls.StateName
	s.mu.Unlock()
}

func (s *SensorLogProvider) onPose(msg []byte) {
	var pose absolutePoseSubset
	if err := json.Unmarshal(msg, &pose); err != nil {
		return
	}
	now := time.Now()
	s.mu.Lock()
	s.lastPoseX = pose.Pose.Pose.Position.X
	s.lastPoseY = pose.Pose.Pose.Position.Y
	s.lastGpsAccuracy = pose.PositionAccuracy
	// Compute speed from consecutive poses using callback timing (~10Hz)
	if s.hasPrev {
		dt := now.Sub(s.prevPoseTime).Seconds()
		if dt > 0.01 && dt < 5 { // ignore <10ms (duplicate) and >5s (gap)
			dx := pose.Pose.Pose.Position.X - s.prevPoseX
			dy := pose.Pose.Pose.Position.Y - s.prevPoseY
			s.lastSpeed = math.Sqrt(dx*dx+dy*dy) / dt
		}
	}
	s.prevPoseX = pose.Pose.Pose.Position.X
	s.prevPoseY = pose.Pose.Pose.Position.Y
	s.prevPoseTime = now
	s.hasPrev = true
	s.hasPose = true
	s.mu.Unlock()
}

func (s *SensorLogProvider) sampleLoop() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	const insertSQL = `INSERT INTO sensor_samples
		(timestamp, x, y,
		 mow_rpm, mow_current, mow_temp_motor, mow_temp_pcb,
		 left_rpm, left_current, left_temp_motor,
		 right_rpm, right_current, right_temp_motor,
		 v_battery, gps_accuracy, speed)
		VALUES (?, ?, ?,  ?, ?, ?, ?,  ?, ?, ?,  ?, ?, ?,  ?, ?, ?)`

	stmt, err := s.db.Prepare(insertSQL)
	if err != nil {
		logrus.Errorf("sensorlog: failed to prepare insert statement: %v", err)
		return
	}
	defer stmt.Close()

	for {
		select {
		case <-s.stopCh:
			return
		case <-ticker.C:
			s.mu.Lock()
			if s.lastStateName == "MOWING" && s.hasPose && s.hasStatus {
				_, err := stmt.Exec(
					time.Now().Unix(), s.lastPoseX, s.lastPoseY,
					s.lastMowRpm, s.lastMowCurrent, s.lastMowTempMot, s.lastMowTempPcb,
					s.lastLeftRpm, s.lastLeftCurrent, s.lastLeftTempMot,
					s.lastRightRpm, s.lastRightCurrent, s.lastRightTempMot,
					s.lastVBattery, float64(s.lastGpsAccuracy)*100.0, s.lastSpeed,
				)
				if err != nil {
					logrus.Errorf("sensorlog: insert failed: %v", err)
				}
			}
			s.mu.Unlock()
		}
	}
}

func (s *SensorLogProvider) retentionLoop() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopCh:
			return
		case <-ticker.C:
			s.pruneOldData()
		}
	}
}

func (s *SensorLogProvider) pruneOldData() {
	cutoff := time.Now().AddDate(0, 0, -s.retentionDays).Unix()
	result, err := s.db.Exec("DELETE FROM sensor_samples WHERE timestamp < ?", cutoff)
	if err != nil {
		logrus.Errorf("sensorlog: retention cleanup failed: %v", err)
		return
	}
	if rows, _ := result.RowsAffected(); rows > 0 {
		logrus.Infof("sensorlog: pruned %d old samples", rows)
	}
}

// QuerySamples returns sensor data for a time range and sensor type.
func (s *SensorLogProvider) QuerySamples(from, to int64, sensor string, limit int) (*SensorLogResponse, error) {
	col, ok := sensorColumnWhitelist[sensor]
	if !ok {
		col = "mow_rpm"
		sensor = "mow_rpm"
	}
	if limit <= 0 || limit > 100000 {
		limit = 50000
	}

	query := "SELECT timestamp, x, y, " + col + " FROM sensor_samples WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp ASC LIMIT ?"
	rows, err := s.db.Query(query, from, to, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var samples []SensorSampleResult
	minVal := math.MaxFloat64
	maxVal := -math.MaxFloat64

	for rows.Next() {
		var r SensorSampleResult
		if err := rows.Scan(&r.T, &r.X, &r.Y, &r.V); err != nil {
			return nil, err
		}
		if r.V < minVal {
			minVal = r.V
		}
		if r.V > maxVal {
			maxVal = r.V
		}
		samples = append(samples, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(samples) == 0 {
		minVal = 0
		maxVal = 0
	}

	return &SensorLogResponse{
		Samples: samples,
		Sensor:  sensor,
		Min:     minVal,
		Max:     maxVal,
		Count:   len(samples),
	}, nil
}

// GetStats returns summary statistics.
func (s *SensorLogProvider) GetStats() (*SensorLogStats, error) {
	var stats SensorLogStats
	err := s.db.QueryRow("SELECT COUNT(*), COALESCE(MIN(timestamp),0), COALESCE(MAX(timestamp),0) FROM sensor_samples").
		Scan(&stats.TotalSamples, &stats.OldestTimestamp, &stats.NewestTimestamp)
	if err != nil {
		return nil, err
	}
	return &stats, nil
}

// SeedMockData generates realistic mock sensor data for local testing.
func (s *SensorLogProvider) SeedMockData(count int) error {
	if count <= 0 {
		count = 3600
	}

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	const insertSQL = `INSERT INTO sensor_samples
		(timestamp, x, y,
		 mow_rpm, mow_current, mow_temp_motor, mow_temp_pcb,
		 left_rpm, left_current, left_temp_motor,
		 right_rpm, right_current, right_temp_motor,
		 v_battery, gps_accuracy, speed)
		VALUES (?, ?, ?,  ?, ?, ?, ?,  ?, ?, ?,  ?, ?, ?,  ?, ?, ?)`

	stmt, err := tx.Prepare(insertSQL)
	if err != nil {
		return err
	}
	defer stmt.Close()

	now := time.Now().Unix()
	startTime := now - int64(count)

	x := 0.0
	y := 0.0
	prevX := 0.0
	prevY := 0.0
	direction := 1.0
	stripWidth := 0.3
	linearSpeed := 0.3

	for i := 0; i < count; i++ {
		ts := startTime + int64(i)

		prevX = x
		prevY = y

		// Move along X, zigzag on Y
		x += linearSpeed * direction

		// Skip ~1/3 of points to simulate sparse data (GPS dropouts, pauses)
		if rand.Float64() < 0.33 {
			continue
		}
		if x > 10.0 || x < 0.0 {
			direction = -direction
			x += linearSpeed * direction
			y += stripWidth
		}

		// Speed from position delta
		dx := x - prevX
		dy := y - prevY
		speed := math.Sqrt(dx*dx + dy*dy)

		// Mow motor: range ~1500-4500 RPM, dips in "thick grass" zone
		mowRpm := 3500.0 + rand.Float64()*1000 - 500
		if x > 4.0 && x < 6.0 {
			mowRpm -= 1500 + rand.Float64()*500 // heavy drop
		}
		// Mow current: range ~0.5-3.5 A
		mowCurrent := 0.5 + (4500-mowRpm)/1500.0*2.5 + rand.Float64()*0.3
		// Mow temps: range ~20-55°C rising over time
		mowTempMotor := 20.0 + float64(i)/float64(count)*35.0 + rand.Float64()*2
		mowTempPcb := 18.0 + float64(i)/float64(count)*25.0 + rand.Float64()*1.5

		// Wheel motors: range ~50-250 RPM, left/right differ on slope
		leftRpm := 150 + rand.Intn(60) - 30
		rightRpm := 145 + rand.Intn(60) - 30
		if y > 3.0 { // slope zone
			leftRpm += 50
			rightRpm -= 40
		}
		// Wheel current: range ~0.3-1.5 A
		leftCurrent := 0.3 + rand.Float64()*0.5 + float64(leftRpm)/250.0*0.7
		rightCurrent := 0.3 + rand.Float64()*0.5 + float64(rightRpm)/250.0*0.7
		// Wheel temps: range ~25-45°C
		leftTempMot := 25.0 + float64(i)/float64(count)*20.0 + rand.Float64()*2
		rightTempMot := 25.0 + float64(i)/float64(count)*20.0 + rand.Float64()*2

		// Battery: range ~26-29V slow discharge
		vBattery := 29.0 - float64(i)/float64(count)*3.0 + rand.Float64()*0.15

		// GPS accuracy: range ~0.005-0.08m
		gpsAccuracy := 0.005 + rand.Float64()*0.04
		if x > 8.0 { // poor GPS zone near trees
			gpsAccuracy += 0.03 + rand.Float64()*0.02
		}

		if _, err := stmt.Exec(
			ts, x, y,
			int(mowRpm), mowCurrent, mowTempMotor, mowTempPcb,
			leftRpm, leftCurrent, leftTempMot,
			rightRpm, rightCurrent, rightTempMot,
			vBattery, gpsAccuracy, speed,
		); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *SensorLogProvider) Close() {
	close(s.stopCh)
	if s.db != nil {
		s.db.Close()
	}
}
