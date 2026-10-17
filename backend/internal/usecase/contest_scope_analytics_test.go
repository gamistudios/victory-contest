package usecase

import (
	"errors"
	"testing"
	"time"

	"victory-contest-go/internal/domain"
)

// Phase 5 scope analytics: the pure aggregation over finalised attempts. The
// board must ignore in-progress / abandoned / excluded tries, honour the shared
// ScopeFilter (including the common-stream-vs-enrolled-stream rule), and keep
// whole-birr-style integer points.

func scoped(id, student, program, stream, subject, chapter string, correct, total, points int) domain.Attempt {
	return domain.Attempt{
		ID: id, StudentID: student, Status: domain.AttemptSubmitted,
		Scope:           &domain.Scope{ProgramID: program, StreamID: stream, SubjectID: subject, ChapterID: chapter},
		StudentStreamID: stream, Correct: correct, Total: total, Points: points,
	}
}

func TestBuildScopeAnalytics(t *testing.T) {
	attempts := []domain.Attempt{
		scoped("a1", "s1", "g12", "natural", "math", "ch1", 8, 10, 30), // 80%
		scoped("a2", "s2", "g12", "natural", "math", "ch1", 3, 10, 10), // 30%
		scoped("a3", "s3", "g11", "natural", "bio", "", 6, 10, 20),     // 60%
		{ID: "x", StudentID: "s4", Status: domain.AttemptSubmitted, Correct: 10, Total: 10, Points: 5, Excluded: true},
		{ID: "ab", StudentID: "s5", Status: domain.AttemptAbandoned, Correct: 9, Total: 10, Points: 5},
		{ID: "ip", StudentID: "s6", Status: domain.AttemptInProgress, Correct: 9, Total: 10, Points: 5},
	}
	regions := map[string]string{"s1": "Addis Ababa", "s2": "Addis Ababa", "s3": "Bahir Dar"}

	got := BuildScopeAnalytics(attempts, regions, domain.AnalyticsQuery{}, time.Now())

	if got.Totals.Attempts != 3 || got.Totals.Students != 3 {
		t.Fatalf("totals = %+v, want 3 attempts / 3 students", got.Totals)
	}
	if got.Totals.TotalPoints != 60 {
		t.Fatalf("total points = %d, want 60 (integer, never fractional)", got.Totals.TotalPoints)
	}
	if got.Totals.AvgPercent != 56.7 {
		t.Fatalf("avg = %v, want 56.7", got.Totals.AvgPercent)
	}
	if got.Totals.MedianPercent != 60 {
		t.Fatalf("median = %v, want 60", got.Totals.MedianPercent)
	}
	if got.Totals.PassRate != 66.7 {
		t.Fatalf("pass rate = %v, want 66.7 (2 of 3 at or above 50%%)", got.Totals.PassRate)
	}

	// Program buckets sort by attempts desc: g12 (2) before g11 (1).
	if len(got.ByProgram) != 2 || got.ByProgram[0].ProgramID != "g12" || got.ByProgram[0].Attempts != 2 {
		t.Fatalf("by program = %+v, want g12 with 2 attempts first", got.ByProgram)
	}

	// Region buckets keyed lower-cased but labelled with the source region.
	if len(got.ByRegion) != 2 || got.ByRegion[0].Region != "Addis Ababa" || got.ByRegion[0].Attempts != 2 {
		t.Fatalf("by region = %+v, want Addis Ababa (2) first", got.ByRegion)
	}

	// Competency: g12/math/ch1 = 11 correct over 20 answered (55%); g11/bio = 60%.
	var g12math, g11bio *domain.CompetencyCell
	for i := range got.Competency {
		c := &got.Competency[i]
		switch {
		case c.ProgramID == "g12" && c.SubjectID == "math":
			g12math = c
		case c.ProgramID == "g11" && c.SubjectID == "bio":
			g11bio = c
		}
	}
	if g12math == nil || g12math.Correct != 11 || g12math.Total != 20 || g12math.Mastery != 55 {
		t.Fatalf("g12/math mastery = %+v, want 11/20 = 55", g12math)
	}
	if g11bio == nil || g11bio.Mastery != 60 {
		t.Fatalf("g11/bio mastery = %+v, want 60", g11bio)
	}

	// Score distribution: 30->bin 3, 60->bin 6, 80->bin 8; each holds one attempt.
	if got.Distribution[3].Count != 1 || got.Distribution[6].Count != 1 || got.Distribution[8].Count != 1 {
		t.Fatalf("distribution bins wrong: %+v", got.Distribution)
	}

	if got.SummarySource != "rule_based_stub" || got.Summary == "" {
		t.Fatalf("summary = %q source %q, want a non-empty rule-based summary", got.Summary, got.SummarySource)
	}
}

func TestBuildScopeAnalyticsProgramFilter(t *testing.T) {
	attempts := []domain.Attempt{
		scoped("a1", "s1", "g12", "natural", "math", "", 8, 10, 30),
		scoped("a3", "s3", "g11", "natural", "bio", "", 6, 10, 20),
	}
	got := BuildScopeAnalytics(attempts, nil, domain.AnalyticsQuery{Filter: domain.ScopeFilter{ProgramIDs: []string{"g12"}}}, time.Now())
	if got.Totals.Attempts != 1 {
		t.Fatalf("filtered attempts = %d, want 1 (only g12)", got.Totals.Attempts)
	}
	if got.ProgramIDs[0] != "g12" {
		t.Fatalf("echoed program_ids = %v, want [g12]", got.ProgramIDs)
	}
}

func TestAttemptInScope(t *testing.T) {
	// Unscoped (legacy) attempt matches only when nothing is constrained.
	legacy := domain.Attempt{Scope: nil}
	if !attemptInScope(legacy, domain.ScopeFilter{}) {
		t.Fatal("unscoped attempt must match an empty filter")
	}
	if attemptInScope(legacy, domain.ScopeFilter{ProgramIDs: []string{"g12"}}) {
		t.Fatal("unscoped attempt must NOT match a constrained filter")
	}

	// A common-stream attempt tagged to a social student is excluded when the
	// filter names only the natural stream (the enrolled-stream rule).
	common := domain.Attempt{Scope: &domain.Scope{ProgramID: "g12", StreamID: domain.StreamCommon}, StudentStreamID: "social"}
	if attemptInScope(common, domain.ScopeFilter{StreamIDs: []string{"natural"}}) {
		t.Fatal("common attempt from a social student must not appear under a natural-only filter")
	}
	if !attemptInScope(common, domain.ScopeFilter{StreamIDs: []string{"social"}}) {
		t.Fatal("common attempt from a social student must appear under the social filter")
	}
}

func TestParseRangeBound(t *testing.T) {
	if _, ok, err := parseRangeBound("", false); ok || err != nil {
		t.Fatal("empty bound must be unset with no error")
	}
	// Bare date, start of range: 00:00 UTC.
	start, ok, err := parseRangeBound("2026-01-02", false)
	if !ok || err != nil || !start.Equal(time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("start bound = %v (ok %v err %v)", start, ok, err)
	}
	// Bare date, end of range: inclusive of the whole day.
	end, ok, err := parseRangeBound("2026-01-02", true)
	if !ok || err != nil || end.Format("2006-01-02") != "2026-01-02" || end.Hour() != 23 {
		t.Fatalf("end bound = %v (ok %v err %v), want same day 23:xx", end, ok, err)
	}
	if _, ok, _ := parseRangeBound("2026-01-02T10:30:00Z", false); !ok {
		t.Fatal("RFC3339 bound must parse")
	}
	if _, _, err := parseRangeBound("garbage", false); !errors.Is(err, ErrBadAnalyticsRange) {
		t.Fatalf("garbage bound err = %v, want ErrBadAnalyticsRange", err)
	}
}
