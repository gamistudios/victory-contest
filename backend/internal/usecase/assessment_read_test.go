package usecase

import (
	"testing"
	"time"

	"victory-contest-go/internal/domain"
)

func TestListAssessmentsScopeLockAndMyAttempt(t *testing.T) {
	u, att, contests, _ := newAttemptFixture()
	scoped := selfPacedContest()
	scoped.ID = "c1"
	scoped.Scope = &domain.Scope{ProgramID: "grade-12", StreamID: "natural-science"}
	shared := selfPacedContest()
	shared.ID = "c2"
	shared.Scope = &domain.Scope{ProgramID: "grade-12", StreamID: domain.StreamCommon}
	other := selfPacedContest()
	other.ID = "c3"
	other.Scope = &domain.Scope{ProgramID: "freshman", StreamID: domain.StreamCommon}
	contests.cs["c1"] = scoped
	contests.cs["c2"] = shared
	contests.cs["c3"] = other

	list, err := u.ListAssessments("s1", domain.ScopeFilter{ProgramIDs: []string{"grade-12"}, StreamIDs: []string{"natural-science"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 {
		t.Fatalf("listed %d, want the natural-science contest plus the common one", len(list))
	}
	for _, m := range list {
		if m.Lock != nil {
			t.Fatal("free contest must not carry a lock")
		}
		if m.QuestionCount != 2 || m.Mode != domain.ContestModeSelfPaced || m.Reveal == "" {
			t.Fatalf("meta = %+v", m)
		}
	}

	// premium lock surfaces on the metadata (never the questions)
	u.Access = func(string, domain.Contest) error { return &LockedError{Lock: LockFor(LockedPremium, "grade-12")} }
	list, _ = u.ListAssessments("s1", domain.ScopeFilter{})
	if list[0].Lock == nil {
		t.Fatal("locked assessment must carry the lock object")
	}

	// my_attempt shows the recorded attempt summary
	u.Access = nil
	if _, err := u.Start("c1", "s1"); err != nil {
		t.Fatal(err)
	}
	if err := att.UpdateAnswers("c1#s1#1", map[string]int{"q1": 1, "q2": 2}, nil, 0); err != nil {
		t.Fatal(err)
	}
	if _, err := u.Submit("c1#s1#1", "s1", nil); err != nil {
		t.Fatal(err)
	}
	list, _ = u.ListAssessments("s1", domain.ScopeFilter{ProgramIDs: []string{"grade-12"}})
	var mine *AssessmentMeta
	for i := range list {
		if list[i].ID == "c1" {
			mine = &list[i]
		}
	}
	if mine == nil || mine.MyAttempt == nil || mine.MyAttempt.Points != 100 || mine.MyAttempt.Status != domain.AttemptSubmitted {
		t.Fatalf("my_attempt missing or wrong: %+v", mine)
	}
}

func TestGetAssessmentIntroData(t *testing.T) {
	u, _, contests, _ := newAttemptFixture()
	c := selfPacedContest()
	c.Kind = domain.ContestKindPastExam
	c.Year = "2018"
	c.Source = "EUEE"
	contests.cs["c1"] = c
	m, err := u.GetAssessment("c1", "s1")
	if err != nil {
		t.Fatal(err)
	}
	if m.Kind != domain.ContestKindPastExam || m.Reveal != domain.RevealOnSubmit || m.Year != "2018" || m.Source != "EUEE" {
		t.Fatalf("intro meta = %+v", m)
	}
	if _, err := u.GetAssessment("nope", "s1"); err == nil {
		t.Fatal("unknown id must error")
	}
}

func TestLeaderboardRanksByPointsThenDuration(t *testing.T) {
	u, att, _, _ := newAttemptFixture()
	mk := func(sid string, points, seconds int, status string, excluded, late bool) {
		att.rows["c1#"+sid+"#1"] = domain.Attempt{
			ID: "c1#" + sid + "#1", ContestID: "c1", StudentID: sid, Status: status,
			Points: points, DurationSeconds: seconds, Excluded: excluded, IsLate: late,
			Correct: points, Total: 100,
		}
	}
	mk("s1", 90, 1500, domain.AttemptSubmitted, false, true)
	mk("s2", 90, 1200, domain.AttemptSubmitted, false, false) // same points, faster => ahead
	mk("s3", 95, 3000, domain.AttemptAutoSubmitted, false, false)
	mk("s4", 100, 60, domain.AttemptAbandoned, false, false) // abandoned never ranks
	mk("s5", 99, 60, domain.AttemptSubmitted, true, false)   // excluded never ranks

	rows, err := u.Leaderboard("c1")
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 3 {
		t.Fatalf("rows = %d, want 3 (no abandoned, no excluded)", len(rows))
	}
	want := []string{"s3", "s2", "s1"}
	for i, w := range want {
		if rows[i].StudentID != w || rows[i].Rank != i+1 {
			t.Fatalf("rank %d = %s, want %s", i+1, rows[i].StudentID, w)
		}
	}
	if !rows[2].IsLate {
		t.Fatal("late flag must reach the leaderboard row")
	}
}

func TestEditorialVisibleBridge(t *testing.T) {
	// ContestHasEnded (the legacy branch) reads the wall clock, so the legacy
	// cases are pinned to real now; the Phase 2 branch takes `now` as a parameter.
	wall := time.Now().UTC()
	end := t0.Add(time.Hour).Format(time.RFC3339)
	legacyPast := domain.Contest{ID: "l", EndTime: wall.Add(-time.Hour).Format(time.RFC3339)}
	legacyFuture := domain.Contest{ID: "l", EndTime: wall.Add(time.Hour).Format(time.RFC3339)}
	if EditorialVisible(legacyFuture, false, wall) {
		t.Fatal("legacy before end: hidden")
	}
	if !EditorialVisible(legacyPast, false, wall) {
		t.Fatal("legacy rule unchanged: after end everyone (even non-participants) sees the editorial")
	}
	p2 := domain.Contest{ID: "p", Mode: domain.ContestModeGlobal, EndTime: end}
	if EditorialVisible(p2, false, t0.Add(2*time.Hour)) {
		t.Fatal("phase 2: a student who never took it must not read answers first")
	}
	if !EditorialVisible(p2, true, t0.Add(2*time.Hour)) {
		t.Fatal("phase 2: finishers see answers at the until-time")
	}
	if EditorialVisible(p2, true, t0) {
		t.Fatal("phase 2: not before the until-time")
	}
}
