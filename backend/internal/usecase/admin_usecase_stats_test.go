package usecase

import (
	"errors"
	"testing"
	"time"
	"victory-contest-go/internal/domain"
)

// --- fakes for the dashboard aggregation (client issue #5) ---
// Interface embedding keeps these fakes immune to unrelated repository growth.

type statsFakeStudentRepo struct {
	StudentRepository
	students []domain.Student
}

func (f *statsFakeStudentRepo) GetStudents() ([]domain.Student, error) { return f.students, nil }

type statsFakeSubmissionRepo struct {
	SubmissionRepository
	subs []domain.Submission
}

func (f *statsFakeSubmissionRepo) GetAllSubmissions() ([]domain.Submission, error) {
	return f.subs, nil
}

type statsFakePaymentRepo struct {
	PaymentRepository
}

func (f *statsFakePaymentRepo) ListAll() ([]domain.PaymentRequest, error) { return nil, nil }

type statsFakePageViewRepo struct {
	PageViewRepository
}

// Returning an error exercises the empty-stats fallback path.
func (f *statsFakePageViewRepo) GetPageViewsByDateRange(_, _ time.Time) ([]domain.PageView, error) {
	return nil, errors.New("page views unavailable")
}

func newStatsUsecase(students []domain.Student, contests []domain.Contest, subs []domain.Submission) *adminUsecase {
	return &adminUsecase{
		studentRepo:    &statsFakeStudentRepo{students: students},
		contestRepo:    &fakeDashboardContestRepo{contests: contests},
		submissionRepo: &statsFakeSubmissionRepo{subs: subs},
		paymentRepo:    &statsFakePaymentRepo{},
		contestRegistrationRepo: &fakeDashboardRegistrationRepo{
			byContest: map[string][]domain.ContestRegistration{},
		},
		pageViewRepo: &statsFakePageViewRepo{},
	}
}

// --- gender normalization (issue #5: charts must sum to the total) ---

func TestNormalizeGenderAliases(t *testing.T) {
	cases := []struct {
		raw  string
		want string
	}{
		{"M", genderMale},
		{"male", genderMale},
		{"  Male ", genderMale},
		{"MALE", genderMale},
		{"F", genderFemale},
		{"female", genderFemale},
		{" Female", genderFemale},
		{"other", genderOther},
		{"O", genderOther},
		{"non-binary", genderOther},
		{"", genderUnknown},
		{"   ", genderUnknown},
		{"x", genderUnknown},
		{"fEMALE", genderFemale}, // full word wins over the letter prefix
		{"maybe", genderUnknown},
	}
	for _, tc := range cases {
		if got := normalizeGender(tc.raw); got != tc.want {
			t.Errorf("normalizeGender(%q) = %q, want %q", tc.raw, got, tc.want)
		}
	}
}

func TestDashboardGenderBucketsSumToTotal(t *testing.T) {
	students := []domain.Student{
		{ID: "s1", Name: "a", Gender: "M", Grade: "9", School: "School One", City: "Addis"},
		{ID: "s2", Name: "b", Gender: "F", Grade: "9", School: "School One", City: "Addis"},
		{ID: "s3", Name: "c", Gender: "male", Grade: "10", School: "School Two", City: "Bahir Dar"},
		{ID: "s4", Name: "d", Gender: "female", Grade: "10", School: "School Two"},
		{ID: "s5", Name: "e", Gender: "other", Grade: "11", School: "School Three"},
		{ID: "s6", Name: "f", Gender: "", Grade: "11", School: "School Three"},
		{ID: "s7", Name: "g", Gender: "queer-typo", Grade: "11"},
		{ID: "s8", Name: "h", Gender: "  ", Grade: "12"},
	}
	u := newStatsUsecase(students, nil, nil)

	stats, err := u.GetDashboardStats()
	if err != nil {
		t.Fatalf("GetDashboardStats: %v", err)
	}
	g := stats.UserStats.ByGender
	if g.Male != 2 || g.Female != 2 || g.Other != 1 || g.Unknown != 3 {
		t.Fatalf("gender buckets = %+v, want male 2 / female 2 / other 1 / unknown 3", g)
	}
	if g.Male+g.Female+g.Other+g.Unknown != g.Total {
		t.Fatalf("buckets %d+%d+%d+%d != total %d", g.Male, g.Female, g.Other, g.Unknown, g.Total)
	}
	if g.Total != len(students) {
		t.Fatalf("gender total = %d, want %d (every student counted)", g.Total, len(students))
	}
}

func TestContestGenderStatsUseSharedHelper(t *testing.T) {
	// The duplicated bucketing in the contest statistics path must share
	// normalizeGender: "M"/"F" count, "other" and junk land in explicit
	// buckets, and the four totals add up to the number of performances.
	perf := func(id, gender string, score float64) domain.StudentContestPerformance {
		return domain.StudentContestPerformance{StudentID: id, StudentGender: gender, Score: score, Performance: "good"}
	}
	performances := []domain.StudentContestPerformance{
		perf("s1", "M", 10), perf("s2", "male", 9),
		perf("s3", "F", 8), perf("s4", "other", 7),
		perf("s5", "", 6), perf("s6", "??", 5),
	}
	u := &contestStatisticsUsecase{}
	g := u.calculateGenderStats(performances)
	if g.Male.Total != 2 || g.Female.Total != 1 || g.Other.Total != 1 || g.Unknown.Total != 2 {
		t.Fatalf("contest gender buckets = %+v", g)
	}
	if g.Male.Total+g.Female.Total+g.Other.Total+g.Unknown.Total != len(performances) {
		t.Fatal("contest gender buckets must sum to total participants")
	}
	if g.Male.AverageScore != 9.5 || g.Male.PassRate != 100 {
		t.Fatalf("male aggregate = %+v, want avg 9.5 pass 100", g.Male)
	}
}

// --- median / average math ---

func TestMedianOf(t *testing.T) {
	if got := medianOf(nil); got != 0 {
		t.Errorf("medianOf(empty) = %v, want 0", got)
	}
	if got := medianOf([]float64{7}); got != 7 {
		t.Errorf("medianOf(single) = %v, want 7", got)
	}
	if got := medianOf([]float64{3, 1, 2}); got != 2 {
		t.Errorf("medianOf(odd) = %v, want 2", got)
	}
	if got := medianOf([]float64{4, 1, 2, 3}); got != 2.5 {
		t.Errorf("medianOf(even) = %v, want 2.5", got)
	}
	src := []float64{5, 1, 3}
	medianOf(src)
	if src[0] != 5 || src[1] != 1 || src[2] != 3 {
		t.Errorf("medianOf mutated caller slice: %v", src)
	}
}

// --- participation / subject scores / submission stats ---

func TestDashboardDeepStats(t *testing.T) {
	now := time.Now()
	students := []domain.Student{
		{ID: "s1", Gender: "M", Grade: "9", School: "Alpha", City: "Addis"},
		{ID: "s2", Gender: "F", Grade: "9", School: "Alpha", City: "Addis"},
		{ID: "s3", Gender: "F", Grade: "10", School: "Beta", City: "Hawassa"},
		{ID: "s4", Gender: "M", Grade: "10", School: "Beta", City: "Hawassa"},
		{ID: "s5", Gender: "x", Grade: "10", School: "Gamma"},
	}
	contests := []domain.Contest{
		{ID: "c1", Subject: "Math", StartTime: "2020-01-01", EndTime: "2020-01-02"},
		{ID: "c2", Subject: "Physics", StartTime: "2020-01-01", EndTime: "2020-01-02"},
	}
	submissions := []domain.Submission{
		// Duplicate keys on purpose (StudentID == Student.ID): this is what
		// the POST /submission endpoint actually stores — must not double-count.
		{ID: "x1", ContestID: "c1", StudentID: "s1", Student: domain.StudentSub{ID: "s1"}, Score: 80, SubmissionTime: now},
		{ID: "x2", ContestID: "c1", StudentID: "s2", Score: 60, SubmissionTime: now},
		{ID: "x3", ContestID: "c2", StudentID: "s1", Score: 70, SubmissionTime: now},
		{ID: "x4", ContestID: "c2", StudentID: "", Student: domain.StudentSub{ID: "s3"}, Score: 40}, // missing timestamp
	}
	u := newStatsUsecase(students, contests, submissions)
	stats, err := u.GetDashboardStats()
	if err != nil {
		t.Fatalf("GetDashboardStats: %v", err)
	}

	// Grade participation: grade 9 -> 2/2, grade 10 -> 1/3 (only s3), 11+none.
	gp := map[string]domain.GradeParticipationStat{}
	for _, s := range stats.UserStats.GradeParticipation {
		gp[s.Grade] = s
	}
	if gp["9"].Students != 2 || gp["9"].Participating != 2 || gp["9"].ParticipationRate != 100 {
		t.Fatalf("grade 9 participation = %+v, want 2/2 at 100%%", gp["9"])
	}
	if gp["10"].Students != 3 || gp["10"].Participating != 1 || gp["10"].ParticipationRate != 33.33 {
		t.Fatalf("grade 10 participation = %+v, want 1/3 at 33.33%%", gp["10"])
	}

	// Top schools: Alpha has 2 participants, Beta 1, Gamma 0.
	ts := stats.UserStats.TopSchools
	if len(ts) != 3 || ts[0].School != "Alpha" || ts[0].Participating != 2 || ts[0].Submissions != 3 {
		t.Fatalf("top schools = %+v", ts)
	}
	if ts[0].City != "Addis" || ts[0].ParticipationRate != 100 {
		t.Fatalf("Alpha detail = %+v", ts[0])
	}

	// Subject scores: Math = {80,60} avg 70 median 70; Physics = {70,40} avg 55 median 55.
	ss := map[string]domain.SubjectScoreStat{}
	for _, s := range stats.ContestStats.SubjectScores {
		ss[s.Subject] = s
	}
	if ss["Math"].Submissions != 2 || ss["Math"].Average != 70 || ss["Math"].Median != 70 {
		t.Fatalf("math subject scores = %+v", ss["Math"])
	}
	if ss["Physics"].Average != 55 || ss["Physics"].Median != 55 {
		t.Fatalf("physics subject scores = %+v", ss["Physics"])
	}

	// Submission stats: 4 total, 3 timestamped, 1 missing, 3 unique students,
	// avg (80+60+70+40)/4 = 62.5, median (60+70)/2 = 65.
	sub := stats.ContestStats.SubmissionStats
	if sub.Total != 4 || sub.Submitted != 3 || sub.MissingTimestamp != 1 || sub.UniqueStudents != 3 {
		t.Fatalf("submission stats = %+v", sub)
	}
	if sub.AverageScore != 62.5 || sub.MedianScore != 65 {
		t.Fatalf("submission score aggregates = %+v", sub)
	}
}

func TestDashboardEmptyDataNoDivByZero(t *testing.T) {
	u := newStatsUsecase(nil, nil, nil)
	stats, err := u.GetDashboardStats()
	if err != nil {
		t.Fatalf("GetDashboardStats: %v", err)
	}
	if stats.UserStats.ByGender.Total != 0 {
		t.Fatalf("gender total = %d, want 0", stats.UserStats.ByGender.Total)
	}
	if stats.ContestStats.SubmissionStats.AverageScore != 0 || stats.ContestStats.SubmissionStats.MedianScore != 0 {
		t.Fatalf("empty submission aggregates must be 0, got %+v", stats.ContestStats.SubmissionStats)
	}
	if len(stats.UserStats.GradeParticipation) != 0 || len(stats.UserStats.TopSchools) != 0 || len(stats.ContestStats.SubjectScores) != 0 {
		t.Fatal("empty inputs must yield empty stat slices")
	}
}

// --- staleness marker (issue #5) ---

func TestDashboardGeneratedAtPresent(t *testing.T) {
	u := newStatsUsecase(nil, nil, nil)
	stats, err := u.GetDashboardStats()
	if err != nil {
		t.Fatalf("GetDashboardStats: %v", err)
	}
	if stats.GeneratedAt == "" {
		t.Fatal("dashboard stats must carry generated_at")
	}
	if _, err := time.Parse(time.RFC3339, stats.GeneratedAt); err != nil {
		t.Fatalf("generated_at %q is not RFC 3339: %v", stats.GeneratedAt, err)
	}
}
