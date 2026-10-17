package usecase

import (
	"errors"
	"testing"

	"victory-contest-go/internal/domain"
)

// Tracks are variable-length: the admin picks DaysCount (1..HabitMaxTrackDays) and every
// calendar, "finished" check and badge follows it. Plans stored without it stay 30 days.

func TestHabitNormalizePlanLength(t *testing.T) {
	f := newHabUC()
	mk := func(count int, days ...domain.HabitDay) domain.HabitPlan {
		p := habPlan("p", domain.HabitAccessFree, days...)
		p.DaysCount = count
		return p
	}
	for _, n := range []int{1, 5, 30, 90, 100, domain.HabitMaxTrackDays} {
		p, err := f.uc.NormalizePlan(mk(n, habDay(1, "a"), habDay(n, "b")))
		if err != nil || p.DaysCount != n || p.Length() != n {
			t.Fatalf("length %d: got %d, err=%v", n, p.DaysCount, err)
		}
	}
	// Unset keeps the 30-day default, or stretches to the furthest authored day.
	if p, err := f.uc.NormalizePlan(mk(0, habDay(1, "a"))); err != nil || p.DaysCount != 30 {
		t.Fatalf("default length = %d, err=%v", p.DaysCount, err)
	}
	if p, err := f.uc.NormalizePlan(mk(0, habDay(1, "a"), habDay(45, "b"))); err != nil || p.DaysCount != 45 {
		t.Fatalf("stretched length = %d, err=%v", p.DaysCount, err)
	}
	// Out of range or a day beyond the chosen length is refused.
	if _, err := f.uc.NormalizePlan(mk(domain.HabitMaxTrackDays+1, habDay(1, "a"))); !errors.Is(err, ErrHabitInvalid) {
		t.Fatalf("too long: %v", err)
	}
	if _, err := f.uc.NormalizePlan(mk(-1, habDay(1, "a"))); !errors.Is(err, ErrHabitInvalid) {
		t.Fatalf("negative: %v", err)
	}
	if _, err := f.uc.NormalizePlan(mk(5, habDay(1, "a"), habDay(6, "b"))); !errors.Is(err, ErrHabitInvalid) {
		t.Fatalf("day beyond length: %v", err)
	}
}

func TestHabitViewFollowsPlanLength(t *testing.T) {
	f := newHabUC()
	p := habPlan("p90", domain.HabitAccessFree, habDay(1, "a"))
	p.DaysCount = 90
	f.repo.PutPlan(p)
	v, err := f.uc.Start(habStudent, "p90")
	if err != nil || v.DaysCount != 90 || len(v.Calendar) != 90 || v.Finished {
		t.Fatalf("90-day view: err=%v days=%d cal=%d finished=%v", err, v.DaysCount, len(v.Calendar), v.Finished)
	}
	plans, err := f.uc.Plans(habStudent)
	if err != nil || len(plans) != 1 || plans[0].DaysCount != 90 {
		t.Fatalf("plans view: %+v err=%v", plans, err)
	}
}

func TestHabitFinishesAtPlanLength(t *testing.T) {
	f := newHabUC()
	p := habPlan("p5", domain.HabitAccessFree, habDay(1, "a"), habDay(5, "e"))
	p.DaysCount = 5
	f.repo.PutPlan(p)
	// Started 5 days ago (2026-10-30): today (11-03) is day 5, the last day.
	f.repo.PutLog(domain.HabitLog{ID: domain.HabitLogID(habStudent, "p5"), StudentID: habStudent, PlanID: "p5", StartDate: "2026-10-30", Done: map[string][]string{}})
	v, err := f.uc.Today(habStudent, "p5")
	if err != nil || v.Finished || v.DayNumber != 5 || len(v.Calendar) != 5 {
		t.Fatalf("last day: err=%v day=%d finished=%v cal=%d", err, v.DayNumber, v.Finished, len(v.Calendar))
	}
	// One more day and it is over; a 30-day plan in the same position would still be running.
	f.repo.PutLog(domain.HabitLog{ID: domain.HabitLogID(habStudent, "p5"), StudentID: habStudent, PlanID: "p5", StartDate: "2026-10-29", Done: map[string][]string{}})
	v, err = f.uc.Today(habStudent, "p5")
	if err != nil || !v.Finished {
		t.Fatalf("after last day: err=%v finished=%v", err, v.Finished)
	}
	if _, err := f.uc.Check(habStudent, "p5", "a"); !errors.Is(err, ErrHabitFinished) {
		t.Fatalf("Check after finish = %v", err)
	}
}

func TestHabitLegacyPlanStaysThirtyDays(t *testing.T) {
	f := newHabUC()
	f.repo.PutPlan(habPlan("old", domain.HabitAccessFree, habDay(1, "a"))) // DaysCount 0 = stored before the field existed
	v, err := f.uc.Start(habStudent, "old")
	if err != nil || v.DaysCount != 30 || len(v.Calendar) != 30 {
		t.Fatalf("legacy view: err=%v days=%d cal=%d", err, v.DaysCount, len(v.Calendar))
	}
}
