package usecase

import (
	"testing"
	"time"

	"victory-contest-go/internal/domain"
)

func TestPointsWorkedExample(t *testing.T) {
	if got := ComputePoints(18, 20, 0); got != 90 {
		t.Fatalf("on time: %d", got)
	}
	if got := ComputePoints(18, 20, 10); got != 81 {
		t.Fatalf("late: %d", got)
	}
}

func TestLateIsBySubmitTime(t *testing.T) {
	c := domain.Contest{Mode: domain.ContestModeSelfPaced, EndTime: "2026-10-15T14:00:00Z", DurationMinutes: 60, LatePenaltyPercent: 10}
	if !IsLateSubmission(c, time.Date(2026, 10, 15, 14, 30, 0, 0, time.UTC)) {
		t.Fatal("expected late")
	}
	if IsLateSubmission(c, time.Date(2026, 10, 15, 13, 50, 0, 0, time.UTC)) {
		t.Fatal("expected on time")
	}
	g := domain.Contest{EndTime: "2026-10-15T14:00:00Z"}
	if IsLateSubmission(g, time.Date(2026, 10, 15, 15, 0, 0, 0, time.UTC)) {
		t.Fatal("global is never late")
	}
}

func TestAnswersVisible(t *testing.T) {
	end := time.Date(2026, 10, 15, 14, 0, 0, 0, time.UTC)
	c := domain.Contest{Mode: domain.ContestModeSelfPaced, EndTime: end.Format(time.RFC3339)}
	done := domain.Attempt{Status: domain.AttemptSubmitted}
	if AnswersVisible(c, domain.Attempt{Status: domain.AttemptInProgress}, end.Add(time.Hour)) {
		t.Fatal("in progress must never see answers")
	}
	if AnswersVisible(c, done, end.Add(-time.Minute)) {
		t.Fatal("before reveal")
	}
	if !AnswersVisible(c, done, end) {
		t.Fatal("at reveal")
	}
	p := domain.Contest{Kind: domain.ContestKindPractice}
	if !AnswersVisible(p, done, end) {
		t.Fatal("practice reveals on submit")
	}
}

func TestStartWindow(t *testing.T) {
	now := time.Date(2026, 10, 16, 9, 0, 0, 0, time.UTC)
	sp := domain.Contest{Mode: domain.ContestModeSelfPaced, StartTime: "2026-10-15T12:00:00Z", EndTime: "2026-10-15T14:00:00Z"}
	if err := CheckStartWindow(sp, now); err != nil {
		t.Fatalf("self paced after end must open: %v", err)
	}
	gl := domain.Contest{StartTime: "2026-10-15T12:00:00Z", EndTime: "2026-10-15T14:00:00Z"}
	if CheckStartWindow(gl, now) != ErrWindowClosed {
		t.Fatal("global closed after end")
	}
}

func TestGradeAnswers(t *testing.T) {
	qs := []domain.Question{{ID: "a", Answer: 2}, {ID: "b", Answer: 1}}
	c, n := GradeAnswers(qs, map[string]int{"a": 2, "b": -1})
	if c != 1 || n != 2 {
		t.Fatalf("%d/%d", c, n)
	}
}
