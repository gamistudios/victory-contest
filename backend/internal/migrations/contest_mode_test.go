package migrations

import (
	"testing"
	"time"

	"victory-contest-go/internal/domain"
)

func TestContestModeForMatchesAddContestDefaulting(t *testing.T) {
	cases := []struct {
		name        string
		in          domain.Contest
		wantMode    string
		wantPenalty int
	}{
		{"legacy window contest", domain.Contest{}, domain.ContestModeGlobal, 0},
		{"limit but no penalty", domain.Contest{DurationMinutes: 45}, domain.ContestModeSelfPaced, domain.DefaultLatePenaltyPercent},
		{"limit and penalty kept", domain.Contest{DurationMinutes: 45, LatePenaltyPercent: 25}, domain.ContestModeSelfPaced, 0},
		{"zero limit stays global", domain.Contest{DurationMinutes: 0, LatePenaltyPercent: 10}, domain.ContestModeGlobal, 0},
	}
	for _, tc := range cases {
		mode, penalty := contestModeFor(tc.in)
		if mode != tc.wantMode || penalty != tc.wantPenalty {
			t.Errorf("%s: got %s/%d want %s/%d", tc.name, mode, penalty, tc.wantMode, tc.wantPenalty)
		}
	}
}

func TestContestWindowReport(t *testing.T) {
	now := time.Date(2026, 10, 16, 12, 0, 0, 0, time.UTC)
	cases := map[string]string{
		"":                     "no end_time",
		"2026-10-20T18:00:00Z": "closes 2026-10-20T18:00:00Z",
		"2026-10-10T18:00:00Z": "ended 2026-10-10T18:00:00Z",
		"2026-10-16T11:59":     "ended 2026-10-16T11:59:00Z",
		"2026-10-16T12:01:00":  "closes 2026-10-16T12:01:00Z",
		"2026-10-17":           "closes 2026-10-17T00:00:00Z",
		"16/10/2026":           "unparsable",
	}
	for in, want := range cases {
		if got := contestWindow(in, now); got != want {
			t.Errorf("contestWindow(%q) = %q, want %q", in, got, want)
		}
	}
}
