package usecase

import (
	"testing"
	"time"
	"victory-contest-go/internal/domain"
)

// --- shared time parsing (issue #38) ---

func TestParseContestTimeAcceptsAllLayouts(t *testing.T) {
	cases := []struct {
		name  string
		value string
		want  time.Time
	}{
		{"rfc3339 utc", "2026-12-31T23:00:00Z", time.Date(2026, 12, 31, 23, 0, 0, 0, time.UTC)},
		{"rfc3339 offset", "2026-12-31T23:00:00+03:00", time.Date(2026, 12, 31, 20, 0, 0, 0, time.UTC)},
		{"legacy no zone", "2026-12-31T23:00:05", time.Date(2026, 12, 31, 23, 0, 5, 0, time.UTC)},
		{"minute precision", "2026-12-31T23:00", time.Date(2026, 12, 31, 23, 0, 0, 0, time.UTC)},
		{"date only", "2026-12-31", time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)},
		{"surrounding spaces", " 2026-12-31T23:00 ", time.Date(2026, 12, 31, 23, 0, 0, 0, time.UTC)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := parseContestTime(tc.value)
			if !ok {
				t.Fatalf("parseContestTime(%q) reported unparseable", tc.value)
			}
			if !got.UTC().Equal(tc.want) {
				t.Fatalf("parseContestTime(%q) = %v, want %v", tc.value, got.UTC(), tc.want)
			}
		})
	}
}

func TestParseContestTimeRejectsGarbage(t *testing.T) {
	for _, value := range []string{"", "   ", "not-a-date", "31/12/2026", "2026-13-45T23:00"} {
		if got, ok := parseContestTime(value); ok {
			t.Fatalf("parseContestTime(%q) unexpectedly parsed to %v", value, got)
		}
	}
}

// calculateContestStats and calculateContestTrendData must agree on how they
// classify a contest whose timestamps use a non-RFC3339-but-valid layout and
// on treating unparseable schedules as "upcoming" (never dropped/active).
func TestContestStatusPathsAgree(t *testing.T) {
	future := time.Now().AddDate(0, 1, 0)
	past := time.Now().AddDate(0, -2, 0)
	contests := []domain.Contest{
		// Odd-but-valid minute-precision layout in the future.
		{ID: "odd", Title: "odd", StartTime: future.Format("2006-01-02T15:04"), EndTime: future.Add(2 * time.Hour).Format("2006-01-02T15:04")},
		// Finished contest in the legacy no-zone layout.
		{ID: "done", Title: "done", StartTime: past.Format("2006-01-02T15:04:05"), EndTime: past.Add(time.Hour).Format("2006-01-02T15:04:05")},
		// Unparseable schedule -> safer classification is "upcoming".
		{ID: "junk", Title: "junk", StartTime: "tomorrow-ish", EndTime: "sometime"},
	}

	u := &adminUsecase{}
	stats := u.calculateContestStats(contests, nil)
	if stats.StatusDistribution.Upcoming != 2 {
		t.Fatalf("status distribution upcoming = %d, want 2 (odd + junk)", stats.StatusDistribution.Upcoming)
	}
	if stats.StatusDistribution.Completed != 1 {
		t.Fatalf("status distribution completed = %d, want 1 (done)", stats.StatusDistribution.Completed)
	}
	if stats.StatusDistribution.Active != 0 {
		t.Fatalf("status distribution active = %d, want 0", stats.StatusDistribution.Active)
	}

	// recent_activity (the other previously-divergent path) must parse the
	// same odd-format contest rather than falling back to "now", and must
	// mark the junk one "N/A" consistently.
	activity := u.getRecentActivity(contests, nil)
	byID := map[string]domain.RecentContest{}
	for _, a := range activity {
		byID[a.ID] = a
	}
	if got := byID["odd"].Date; got != future.Format("2006-01-02") {
		t.Fatalf("recent_activity odd date = %q, want %q", got, future.Format("2006-01-02"))
	}
	if got := byID["junk"].Date; got != "N/A" {
		t.Fatalf("recent_activity junk date = %q, want N/A", got)
	}
	if got := byID["junk"].TotalTime; got != "N/A" {
		t.Fatalf("recent_activity junk totaltime = %q, want N/A", got)
	}
}

// --- revenue (issue #37) ---

func TestCalculateRevenueSumsApprovedAmounts(t *testing.T) {
	payments := []domain.PaymentRequest{
		{ID: "p1", Status: domain.StatusApproved, Amount: 1234.56},
		{ID: "p2", Status: domain.StatusApproved, Amount: 500},
		{ID: "p3", Status: domain.StatusPending, Amount: 9999},
		{ID: "p4", Status: domain.StatusRejected, Amount: 777},
		{ID: "p5", Status: domain.StatusApproved}, // legacy row without an amount attribute
	}
	u := &adminUsecase{}
	if got := u.calculateRevenue(payments); got != 1734.56 {
		t.Fatalf("calculateRevenue = %v, want 1734.56 (approved only)", got)
	}
}

func TestCalculateRevenueTrendUsesRealAmounts(t *testing.T) {
	now := time.Now()
	payments := []domain.PaymentRequest{
		{ID: "p1", Status: domain.StatusApproved, Amount: 1234.56, UpdatedAt: now},
		{ID: "p2", Status: domain.StatusPending, Amount: 5000, UpdatedAt: now},
	}
	u := &adminUsecase{}
	trend := u.calculateRevenueTrendData(payments)
	total := 0
	for _, v := range trend {
		total += v
	}
	if total != 1234 {
		t.Fatalf("revenue trend total = %d, want 1234 (truncated approved amount on today)", total)
	}
}

func TestOverviewRevenueAndRegistrationValues(t *testing.T) {
	registrations := []domain.ContestRegistration{
		{ID: "r1", ContestID: "c1", StudentID: "s1", RegisteredAt: time.Now()},
		{ID: "r2", ContestID: "c1", StudentID: "s2", RegisteredAt: time.Now()},
	}
	payments := []domain.PaymentRequest{{ID: "p1", Status: domain.StatusApproved, Amount: 1234.56}}

	u := &adminUsecase{}
	overview := u.calculateOverviewStats(nil, []domain.Contest{{ID: "c1"}}, registrations, payments)
	if got := overview.Revenue.Value; got != "ETB 1234.56" {
		t.Fatalf("revenue value = %q, want %q", got, "ETB 1234.56")
	}
	if got := overview.Registrations.Value; got != "2" {
		t.Fatalf("registrations value = %q, want 2", got)
	}
}

// --- registrations sourced from the registration repo (issue #37) ---

type fakeDashboardRegistrationRepo struct {
	ContestRegistrationRepository
	byContest map[string][]domain.ContestRegistration
	all       []domain.ContestRegistration
	err       error
}

func (f *fakeDashboardRegistrationRepo) GetRegistrationsByContest(contestID string) ([]domain.ContestRegistration, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.byContest[contestID], nil
}

// ListAll backs the dashboard's single-scan registration fetch (issue #3).
func (f *fakeDashboardRegistrationRepo) ListAll() ([]domain.ContestRegistration, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.all, nil
}

type fakeDashboardContestRepo struct {
	ContestRepository
	contests []domain.Contest
}

func (f *fakeDashboardContestRepo) GetAllContests() ([]domain.Contest, error) { return f.contests, nil }

func TestFetchRegistrationsCountsRealRegistrationsNotSubmissions(t *testing.T) {
	regRepo := &fakeDashboardRegistrationRepo{all: []domain.ContestRegistration{
		{ID: "r1", ContestID: "c1", StudentID: "s1"},
		{ID: "r2", ContestID: "c1", StudentID: "s2"},
		{ID: "r3", ContestID: "c2", StudentID: "s1"},
	}}
	u := &adminUsecase{
		contestRegistrationRepo: regRepo,
	}
	got, err := u.fetchRegistrations()
	if err != nil {
		t.Fatalf("fetchRegistrations returned error: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("fetchRegistrations returned %d rows, want 3", len(got))
	}
}
