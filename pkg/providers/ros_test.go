package providers

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

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
