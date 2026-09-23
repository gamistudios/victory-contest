package usecase

import (
	"fmt"
	"math/rand"
	"reflect"
	"testing"
	"time"
	"victor-contest-go/internal/domain"
)

// Differential test for the issue #3 single-pass trend rewrite.
//
// The *Ref functions below are verbatim copies of the ORIGINAL O(30n)
// implementations (30-day loop x full slice scan) that lived in
// admin_usecase.go before the rewrite. Each test runs the old and the new
// algorithm over randomized fixtures and asserts IDENTICAL output.
//
// Both sides call time.Now() internally, so a fixture can only bucket
// identically while the 30-day window is stable; the harness skips the
// iteration if the local calendar date ticks over between the two calls
// (the window depends solely on now's date + location).

// ---------- reference (old) implementations ----------

func refUserTrend(students []domain.Student) []int {
	now := time.Now()
	trendData := make([]int, 30)

	studentsWithTimestamps := 0
	studentsWithoutTimestamps := 0

	for _, student := range students {
		if student.CreatedAt.IsZero() {
			studentsWithoutTimestamps++
		} else {
			studentsWithTimestamps++
		}
	}

	if studentsWithoutTimestamps > studentsWithTimestamps {
		studentsPerDay := studentsWithoutTimestamps / 30
		remainder := studentsWithoutTimestamps % 30

		for i := 0; i < 30; i++ {
			count := studentsPerDay
			if i < remainder {
				count++
			}
			trendData[i] = count
		}

		for i := 0; i < 30; i++ {
			targetDate := now.AddDate(0, 0, -29+i)
			startOfDay := time.Date(targetDate.Year(), targetDate.Month(), targetDate.Day(), 0, 0, 0, 0, targetDate.Location())
			endOfDay := startOfDay.Add(24 * time.Hour)

			for _, student := range students {
				if !student.CreatedAt.IsZero() && student.CreatedAt.After(startOfDay) && student.CreatedAt.Before(endOfDay) {
					trendData[i]++
				}
			}
		}
	} else {
		for i := 0; i < 30; i++ {
			targetDate := now.AddDate(0, 0, -29+i)
			count := 0

			startOfDay := time.Date(targetDate.Year(), targetDate.Month(), targetDate.Day(), 0, 0, 0, 0, targetDate.Location())
			endOfDay := startOfDay.Add(24 * time.Hour)

			for _, student := range students {
				createdAt := student.CreatedAt
				if createdAt.IsZero() {
					continue
				}
				if createdAt.After(startOfDay) && createdAt.Before(endOfDay) {
					count++
				}
			}

			trendData[i] = count
		}
	}

	return trendData
}

func refContestTrend(contests []domain.Contest) []int {
	now := time.Now()
	trendData := make([]int, 30)

	for i := 0; i < 30; i++ {
		targetDate := now.AddDate(0, 0, -29+i)
		count := 0

		for _, contest := range contests {
			startTime, ok := parseContestTime(contest.StartTime)
			if !ok {
				continue
			}

			if startTime.Year() == targetDate.Year() &&
				startTime.YearDay() == targetDate.YearDay() {
				count++
			}
		}

		trendData[i] = count
	}

	return trendData
}

func refRevenueTrend(payments []domain.PaymentRequest) []int {
	now := time.Now()
	trendData := make([]int, 30)

	for i := 0; i < 30; i++ {
		targetDate := now.AddDate(0, 0, -29+i)
		revenue := 0.0

		for _, payment := range payments {
			if payment.Status == domain.StatusApproved &&
				payment.UpdatedAt.Year() == targetDate.Year() &&
				payment.UpdatedAt.YearDay() == targetDate.YearDay() {
				revenue += payment.Amount
			}
		}

		trendData[i] = int(revenue)
	}

	return trendData
}

func refRegistrationTrend(registrations []domain.ContestRegistration) []int {
	now := time.Now()
	trendData := make([]int, 30)

	for i := 0; i < 30; i++ {
		targetDate := now.AddDate(0, 0, -29+i)
		count := 0

		for _, registration := range registrations {
			registeredAt := registration.RegisteredAt
			if registeredAt.IsZero() {
				continue
			}
			if registeredAt.Year() == targetDate.Year() &&
				registeredAt.YearDay() == targetDate.YearDay() {
				count++
			}
		}

		trendData[i] = count
	}

	return trendData
}

// ---------- fixture helpers ----------

// clockStable reports whether the local calendar date (the only input to the
// 30-day window construction) is the same at both sample points, i.e. the
// old and new implementations were guaranteed to bucket against identical
// windows.
func clockStable(a, b time.Time) bool {
	return a.Year() == b.Year() && a.YearDay() == b.YearDay() && a.Location().String() == b.Location().String()
}

// randomDayTime returns a timestamp offset -35..+3 days around now with a
// random time-of-day, hitting the strict After/Before window edges hard:
// exact local midnight, midnight +- 1ns, and out-of-range days.
func randomDayTime(rnd *rand.Rand, now time.Time) time.Time {
	localNow := now.In(now.Location())
	midnight := time.Date(localNow.Year(), localNow.Month(), localNow.Day(), 0, 0, 0, 0, localNow.Location())
	day := -35 + rnd.Intn(38)
	switch rnd.Intn(6) {
	case 0: // exact midnight (belongs to NO window under the strict checks)
		return midnight.AddDate(0, 0, day)
	case 1: // one nanosecond before midnight of `day`
		return midnight.AddDate(0, 0, day).Add(-time.Nanosecond)
	case 2: // one nanosecond after midnight
		return midnight.AddDate(0, 0, day).Add(time.Nanosecond)
	case 3: // end-of-day nanosecond
		return midnight.AddDate(0, 0, day+1).Add(-time.Nanosecond)
	case 4: // exact +24h boundary of the day's own midnight
		return midnight.AddDate(0, 0, day).Add(24 * time.Hour)
	default: // arbitrary instant
		return midnight.AddDate(0, 0, day).Add(time.Duration(rnd.Int63n(int64(48 * time.Hour))))
	}
}

func fixStudent(id string, created time.Time, zero bool) domain.Student {
	s := domain.Student{ID: id}
	if !zero {
		s.CreatedAt = created
	}
	return s
}

// ---------- differential tests ----------

func TestUserTrendDifferentialOldVsNew(t *testing.T) {
	u := &adminUsecase{}
	for _, seed := range []int64{1, 7, 42, 1337, 20260926} {
		rnd := rand.New(rand.NewSource(seed))
		now := time.Now()
		var students []domain.Student
		for i := range 400 {
			if rnd.Intn(8) == 0 { // legacy rows without a timestamp
				students = append(students, fixStudent(fmt.Sprintf("s%d", i), time.Time{}, true))
				continue
			}
			ts := randomDayTime(rnd, now)
			if rnd.Intn(4) == 0 { // stored in a different zone: comparisons are instant-based
				ts = ts.In(time.FixedZone("UTC+3", 3*3600))
			}
			students = append(students, fixStudent(fmt.Sprintf("s%d", i), ts, false))
		}

		t0 := time.Now()
		want := refUserTrend(students)
		got := u.calculateUserTrendData(students)
		if !clockStable(t0, time.Now()) {
			t.Skip("local date ticked over mid-test; window unstable")
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("seed %d: user trend mismatch\nold=%v\nnew=%v", seed, want, got)
		}
	}
}

// also cover the even-distribution branch (majority without timestamps)
func TestUserTrendDifferentialMissingTimestampBranch(t *testing.T) {
	u := &adminUsecase{}
	rnd := rand.New(rand.NewSource(99))
	now := time.Now()
	var students []domain.Student
	for i := range 300 {
		if i%10 < 7 { // without > with -> even-distribution branch
			students = append(students, fixStudent(fmt.Sprintf("s%d", i), time.Time{}, true))
			continue
		}
		students = append(students, fixStudent(fmt.Sprintf("s%d", i), randomDayTime(rnd, now), false))
	}

	t0 := time.Now()
	want := refUserTrend(students)
	got := u.calculateUserTrendData(students)
	if !clockStable(t0, time.Now()) {
		t.Skip("local date ticked over mid-test; window unstable")
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("user trend (even-distribution branch) mismatch\nold=%v\nnew=%v", want, got)
	}
}

func TestContestTrendDifferentialOldVsNew(t *testing.T) {
	u := &adminUsecase{}
	layouts := []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02T15:04", "2006-01-02"}
	garbage := []string{"", "   ", "not-a-date", "31/12/2026"}
	for _, seed := range []int64{1, 7, 42, 1337, 20260926} {
		rnd := rand.New(rand.NewSource(seed))
		now := time.Now()
		var contests []domain.Contest
		for i := range 200 {
			c := domain.Contest{ID: fmt.Sprintf("c%d", i)}
			switch {
			case rnd.Intn(10) == 0: // unparseable schedule: excluded from buckets
				c.StartTime = garbage[rnd.Intn(len(garbage))]
			case rnd.Intn(10) == 1:
				c.StartTime = " " + randomDayTime(rnd, now).Format(time.RFC3339) + " "
			default:
				ts := randomDayTime(rnd, now)
				if rnd.Intn(3) == 0 {
					ts = ts.In(time.FixedZone("UTC-7", -7*3600))
				}
				c.StartTime = ts.Format(layouts[rnd.Intn(len(layouts))])
			}
			contests = append(contests, c)
		}

		t0 := time.Now()
		want := refContestTrend(contests)
		got := u.calculateContestTrendData(contests)
		if !clockStable(t0, time.Now()) {
			t.Skip("local date ticked over mid-test; window unstable")
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("seed %d: contest trend mismatch\nold=%v\nnew=%v", seed, want, got)
		}
	}
}

func TestRevenueTrendDifferentialOldVsNew(t *testing.T) {
	u := &adminUsecase{}
	statuses := []domain.PaymentStatus{domain.StatusApproved, domain.StatusPending, domain.StatusRejected}
	for _, seed := range []int64{1, 7, 42, 1337, 20260926} {
		rnd := rand.New(rand.NewSource(seed))
		now := time.Now()
		var payments []domain.PaymentRequest
		for i := range 250 {
			p := domain.PaymentRequest{
				ID:     fmt.Sprintf("p%d", i),
				Status: statuses[rnd.Intn(len(statuses))],
				// fractional + negative amounts stress the int-truncation path
				Amount:    (rnd.Float64()*20000 - 500) + 0.005,
				UpdatedAt: randomDayTime(rnd, now),
			}
			if rnd.Intn(20) == 0 {
				p.UpdatedAt = time.Time{} // legacy zero UpdatedAt
			}
			if rnd.Intn(5) == 0 {
				p.UpdatedAt = p.UpdatedAt.In(time.FixedZone("UTC+8", 8*3600))
			}
			payments = append(payments, p)
		}

		t0 := time.Now()
		want := refRevenueTrend(payments)
		got := u.calculateRevenueTrendData(payments)
		if !clockStable(t0, time.Now()) {
			t.Skip("local date ticked over mid-test; window unstable")
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("seed %d: revenue trend mismatch\nold=%v\nnew=%v", seed, want, got)
		}
	}
}

func TestRegistrationTrendDifferentialOldVsNew(t *testing.T) {
	u := &adminUsecase{}
	for _, seed := range []int64{1, 7, 42, 1337, 20260926} {
		rnd := rand.New(rand.NewSource(seed))
		now := time.Now()
		var regs []domain.ContestRegistration
		for i := range 250 {
			r := domain.ContestRegistration{
				ID:        fmt.Sprintf("r%d", i),
				ContestID: fmt.Sprintf("c%d", rnd.Intn(5)),
				StudentID: fmt.Sprintf("s%d", rnd.Intn(50)),
			}
			if rnd.Intn(15) != 0 { // some rows still have no RegisteredAt
				r.RegisteredAt = randomDayTime(rnd, now)
			}
			regs = append(regs, r)
		}

		t0 := time.Now()
		want := refRegistrationTrend(regs)
		got := u.calculateRegistrationTrendData(regs)
		if !clockStable(t0, time.Now()) {
			t.Skip("local date ticked over mid-test; window unstable")
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("seed %d: registration trend mismatch\nold=%v\nnew=%v", seed, want, got)
		}
	}
}
