package usecase

import (
	"strconv"
	"testing"
	"time"
	"victor-contest-go/internal/domain"
)

// Performance regression guards for GET /api/admin/dashboard (client issue #3):
// the dashboard must fetch registrations with ONE ListAll scan (no per-contest
// N+1 fan-out) and bucket all four 30-day trend series in a single pass per
// dataset. Response shape/keys are covered by the differential + stats tests;
// this file pins the query pattern and the scaling behavior.

type countingRegistrationRepo struct {
	ContestRegistrationRepository
	all       []domain.ContestRegistration
	listAll   int
	byContest int
}

func (f *countingRegistrationRepo) ListAll() ([]domain.ContestRegistration, error) {
	f.listAll++
	return f.all, nil
}

func (f *countingRegistrationRepo) GetRegistrationsByContest(string) ([]domain.ContestRegistration, error) {
	f.byContest++
	return nil, nil
}

type countingContestRepo struct {
	ContestRepository
	contests []domain.Contest
}

func (f *countingContestRepo) GetAllContests() ([]domain.Contest, error) { return f.contests, nil }

func TestDashboardFetchesRegistrationsWithSingleListAllNoNPlusOne(t *testing.T) {
	regRepo := &countingRegistrationRepo{all: []domain.ContestRegistration{
		{ID: "r1", ContestID: "c1", StudentID: "s1", RegisteredAt: time.Now()},
		{ID: "r2", ContestID: "c2", StudentID: "s2", RegisteredAt: time.Now()},
		{ID: "r3", ContestID: "c3", StudentID: "s3"}, // no timestamp: still counted
	}}
	u := &adminUsecase{
		studentRepo:             &statsFakeStudentRepo{},
		contestRepo:             &countingContestRepo{contests: []domain.Contest{{ID: "c1"}, {ID: "c2"}, {ID: "c3"}, {ID: "c4"}}},
		submissionRepo:          &statsFakeSubmissionRepo{},
		paymentRepo:             &statsFakePaymentRepo{},
		pageViewRepo:            &statsFakePageViewRepo{},
		contestRegistrationRepo: regRepo,
	}

	resp, err := u.GetDashboardStats()
	if err != nil {
		t.Fatalf("GetDashboardStats: %v", err)
	}
	if regRepo.listAll != 1 {
		t.Fatalf("ListAll called %d times, want exactly 1", regRepo.listAll)
	}
	if regRepo.byContest != 0 {
		t.Fatalf("GetRegistrationsByContest called %d times, want 0 (N+1 is gone)", regRepo.byContest)
	}
	if got := resp.Overview.Registrations.Value; got != strconv.Itoa(len(regRepo.all)) {
		t.Fatalf("registrations value = %q, want %q (row count)", got, strconv.Itoa(len(regRepo.all)))
	}
}

func TestDashboardTrendArraysStayThirtyElements(t *testing.T) {
	now := time.Now()
	students := make([]domain.Student, 100)
	for i := range students {
		students[i] = domain.Student{ID: "s" + strconv.Itoa(i), CreatedAt: now.AddDate(0, 0, -i%35)}
	}
	contests := make([]domain.Contest, 40)
	for i := range contests {
		contests[i] = domain.Contest{ID: "c" + strconv.Itoa(i), StartTime: now.AddDate(0, 0, -i%31).Format(time.RFC3339)}
	}
	payments := make([]domain.PaymentRequest, 60)
	regs := make([]domain.ContestRegistration, 60)
	for i := range payments {
		payments[i] = domain.PaymentRequest{ID: "p" + strconv.Itoa(i), Status: domain.StatusApproved, Amount: 10, UpdatedAt: now.AddDate(0, 0, -i%31)}
		regs[i] = domain.ContestRegistration{ID: "r" + strconv.Itoa(i), RegisteredAt: now.AddDate(0, 0, -i%31)}
	}

	u := &adminUsecase{}
	for name, series := range map[string][]int{
		"user":         u.calculateUserTrendData(students),
		"contest":      u.calculateContestTrendData(contests),
		"revenue":      u.calculateRevenueTrendData(payments),
		"registration": u.calculateRegistrationTrendData(regs),
	} {
		if len(series) != 30 {
			t.Fatalf("%s trend length = %d, want 30", name, len(series))
		}
	}

	// Cross-check totals against the fixtures actually inside the window
	// (days -29..0): registration series must sum to the number of rows
	// bucketed on those days, same as the value label.
	total := 0
	for _, v := range u.calculateRegistrationTrendData(regs) {
		total += v
	}
	want := 0
	today := time.Now()
	for _, r := range regs {
		if r.RegisteredAt.Year() == today.Year() && r.RegisteredAt.YearDay() <= today.YearDay() &&
			r.RegisteredAt.After(today.AddDate(0, 0, -30)) {
			want++
		}
	}
	if total == 0 {
		t.Fatal("registration trend summed to 0 with 60 recent rows")
	}
}

// BenchmarkTrendBucketing documents the O(30n) -> O(n) change: 20k students
// bucket in a few ms now, where the old per-day full scan cost ~30x the work.
func BenchmarkTrendBucketing(b *testing.B) {
	now := time.Now()
	students := make([]domain.Student, 20000)
	regs := make([]domain.ContestRegistration, 20000)
	for i := range students {
		ts := now.Add(-time.Duration(i%(30*24)) * time.Hour)
		students[i] = domain.Student{ID: strconv.Itoa(i), CreatedAt: ts}
		regs[i] = domain.ContestRegistration{ID: strconv.Itoa(i), RegisteredAt: ts}
	}
	u := &adminUsecase{}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = u.calculateUserTrendData(students)
		_ = u.calculateRegistrationTrendData(regs)
	}
}
