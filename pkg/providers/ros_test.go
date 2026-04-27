package providers

import (
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// stubDBProvider is a minimal IDBProvider that fails every Get with a
// configurable error. The atomic counter lets tests assert call frequency.
type stubDBProvider struct {
	getCount atomic.Int64
	getErr   error
}

func (s *stubDBProvider) Set(key string, value []byte) error              { return nil }
func (s *stubDBProvider) Delete(key string) error                         { return nil }
func (s *stubDBProvider) KeysWithSuffix(suffix string) ([]string, error)  { return nil, nil }
func (s *stubDBProvider) Get(key string) ([]byte, error) {
	s.getCount.Add(1)
	return nil, s.getErr
}

// TestNewRosProvider_WatchdogStartsEvenWhenInitFails locks in the fix for
// the regression where, if rosmaster was unreachable at GUI boot,
// initSubscribers would fail and the constructor returned early WITHOUT
// starting the watchdog goroutine — leaving the GUI permanently unable to
// recover from an openmower_ros restart for the lifetime of the process.
//
// The watchdog must run regardless of whether initial setup succeeded.
// We assert that by giving it a DB stub that fails every Get (so getNode
// fails, so initSubscribers fails) and confirming the watchdog keeps
// ticking — visible as a steady stream of Get calls long after construction
// returned.
func TestNewRosProvider_WatchdogStartsEvenWhenInitFails(t *testing.T) {
	origTick := watchdogTick
	watchdogTick = 30 * time.Millisecond
	t.Cleanup(func() { watchdogTick = origTick })

	db := &stubDBProvider{getErr: errors.New("test: db not configured")}
	_ = NewRosProvider(db)

	// Wait for construction-time Get calls to settle, then sample.
	time.Sleep(50 * time.Millisecond)
	before := db.getCount.Load()
	time.Sleep(200 * time.Millisecond)
	after := db.getCount.Load()

	// At 30ms tick over 200ms we expect ~6 ticks. Allow slack for scheduler.
	assert.GreaterOrEqual(t, after-before, int64(3),
		"watchdog goroutine should keep ticking after init failures (Get calls before=%d after=%d)", before, after)
}

// TestShouldResetForStaleness exercises the watchdog's pure decision function.
// The background: after `openmower_ros` restarts, the master comes back but
// every goroslib.Subscriber is still wedged on old publisher URLs. `NodePing`
// lies (it succeeds against the new master/rosout), so staleness of
// /ll/mower_status + /ll/power is our real signal. We must NOT reset during
// boot (node just created, no messages yet) and must NOT reset if only one
// of the two topics is silent.
func TestShouldResetForStaleness(t *testing.T) {
	now := time.Now()
	past := func(d time.Duration) time.Time { return now.Add(-d) }

	tests := []struct {
		name          string
		nodeCreatedAt time.Time
		statusAt      time.Time
		powerAt       time.Time
		want          bool
	}{
		{
			name:          "no node yet: never reset",
			nodeCreatedAt: time.Time{},
			statusAt:      time.Time{},
			powerAt:       time.Time{},
			want:          false,
		},
		{
			name:          "within boot grace, no messages: wait",
			nodeCreatedAt: past(10 * time.Second),
			statusAt:      time.Time{},
			powerAt:       time.Time{},
			want:          false,
		},
		{
			name:          "past boot grace, both topics fresh: healthy",
			nodeCreatedAt: past(5 * time.Minute),
			statusAt:      past(1 * time.Second),
			powerAt:       past(1 * time.Second),
			want:          false,
		},
		{
			name:          "past boot grace, status fresh / power silent: healthy (don't reset on one)",
			nodeCreatedAt: past(5 * time.Minute),
			statusAt:      past(1 * time.Second),
			powerAt:       past(10 * time.Minute),
			want:          false,
		},
		{
			name:          "past boot grace, power fresh / status silent: healthy (don't reset on one)",
			nodeCreatedAt: past(5 * time.Minute),
			statusAt:      past(10 * time.Minute),
			powerAt:       past(1 * time.Second),
			want:          false,
		},
		{
			name:          "past boot grace, both silent: reset",
			nodeCreatedAt: past(5 * time.Minute),
			statusAt:      past(2 * time.Minute),
			powerAt:       past(2 * time.Minute),
			want:          true,
		},
		{
			name:          "past boot grace, zero timestamps: reset (never received anything)",
			nodeCreatedAt: past(5 * time.Minute),
			statusAt:      time.Time{},
			powerAt:       time.Time{},
			want:          true,
		},
		{
			name:          "both silent but node just created: wait (boot grace wins)",
			nodeCreatedAt: past(10 * time.Second),
			statusAt:      past(2 * time.Minute),
			powerAt:       past(2 * time.Minute),
			want:          false,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			got := shouldResetForStaleness(now, tc.nodeCreatedAt, tc.statusAt, tc.powerAt)
			assert.Equal(t, tc.want, got)
		})
	}
}
