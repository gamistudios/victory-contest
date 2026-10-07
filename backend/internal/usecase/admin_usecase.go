package usecase

import (
	"crypto/subtle"
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"victory-contest-go/internal/domain"

	"golang.org/x/crypto/bcrypt"
)

var ErrInvalidCredentials = errors.New("invalid credentials")

// ErrNotApproved is returned by SignIn when the email/password pair is valid
// but the admin account has not been approved by an existing admin yet. The
// handler maps it to HTTP 403 and must NOT issue a session cookie.
var ErrNotApproved = errors.New("account not approved")

// ErrAdminNotFound is returned by UpdateAdmin/DeleteAdmin when no row is
// keyed by the requested id; the handler maps it to HTTP 404 instead of
// blindly writing a new (or orphan) item.
var ErrAdminNotFound = errors.New("admin not found")

// AdminUpdate carries the mutable fields accepted by PUT /api/admin/:id.
// A nil field means "leave the stored value untouched", so a partial body
// can never blank an admin's email, name or approval flag (id-vs-email fix).
type AdminUpdate struct {
	Name       *string
	IsApproved *bool
	Password   *string
}

// contestTimeLayouts is the superset of timestamp layouts observed in stored
// contest start/end times (issue #38): RFC 3339 (with Z or numeric offset)
// plus the legacy layouts — no-offset ISO, minute precision, and date only.
var contestTimeLayouts = []string{
	time.RFC3339,          // 2006-01-02T15:04:05Z07:00 (also covers ...Z)
	"2006-01-02T15:04:05", // no timezone
	"2006-01-02T15:04",    // minute precision
	"2006-01-02",          // date only
}

// Canonical gender buckets (client issue #5). Every stored value maps to
// exactly one of these, so gender stats always add up to the total student
// count instead of silently dropping unrecognized rows.
const (
	genderMale    = "Male"
	genderFemale  = "Female"
	genderOther   = "Other"
	genderUnknown = "Unknown"
)

// normalizeGender maps raw student.gender values to one of the four canonical
// buckets. Matching is case-insensitive and trims whitespace, and accepts the
// one-letter aliases ("M"/"F") that seed/legacy clients actually store —
// the old exact-string bucketing dropped those rows entirely (issue #5).
// Empty, missing, malformed or unrecognized values land in "Unknown" rather
// than disappearing, keeping every chart sum equal to the population total.
// This is the SINGLE helper used by both the admin dashboard and the contest
// statistics gender bucketing so the two can never disagree again.
func normalizeGender(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "m", "male":
		return genderMale
	case "f", "female":
		return genderFemale
	case "o", "other", "non-binary", "prefer not to say":
		return genderOther
	default:
		return genderUnknown
	}
}

// medianOf returns the median of the given scores. It returns 0 for an empty
// slice (no data) and the average of the two middle values for even lengths.
// The input is copied before sorting so callers' slices are untouched.
func medianOf(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sorted := make([]float64, len(values))
	copy(sorted, values)
	sort.Float64s(sorted)
	n := len(sorted)
	if n%2 == 1 {
		return sorted[n/2]
	}
	return (sorted[n/2-1] + sorted[n/2]) / 2
}

// parseContestTime parses a contest timestamp against every layout in
// contestTimeLayouts. It is the SINGLE parsing path used by all dashboard
// computations so status classification can no longer disagree with itself
// (issue #38). ok is false when the value is empty or unparseable; callers
// must apply the same fallback everywhere: an unparseable contest is treated
// as "upcoming" (never reported as active/completed) and is excluded from
// date-bucketed trend series, since it has no trustworthy date.
func parseContestTime(value string) (t time.Time, ok bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, false
	}
	for _, layout := range contestTimeLayouts {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed, true
		}
	}
	return time.Time{}, false
}

type AdminUsecase interface {
	AddAdmin(admin domain.Admin) (string, error)
	UpdateAdmin(id string, update AdminUpdate) error
	DeleteAdmin(id string) error
	GetAdminByID(id string) (*domain.Admin, error)
	GetAllAdmins() ([]domain.Admin, error)
	SignIn(email, password string) (*domain.Admin, error)
	GetAdminByEmail(email string) (*domain.Admin, error)
	GetDashboardStats() (*domain.DashboardStatsResponse, error)
	// RefreshDashboardStats recomputes the dashboard, bypassing the in-memory
	// cache, for on-demand up-to-date numbers (client task 4).
	RefreshDashboardStats() (*domain.DashboardStatsResponse, error)
	// WithQuestionRepo attaches the question bank to the dashboard aggregation.
	// It is a builder method (returns the interface) so wiring can compose it
	// onto the usecase without changing the stable NewAdminUsecase signature
	// that existing unit tests use; a usecase that never gets a question repo
	// simply reports zero question stats.
	WithQuestionRepo(q QuestionRepository) AdminUsecase
}

type adminUsecase struct {
	repo                    AdminRepository
	studentRepo             StudentRepository
	contestRepo             ContestRepository
	submissionRepo          SubmissionRepository
	contestRegistrationRepo ContestRegistrationRepository
	paymentRepo             PaymentRepository
	pageViewRepo            PageViewRepository
	questionRepo            QuestionRepository

	// Dashboard stats cache (client task 4 / performance): the aggregation is
	// full-table scans, so serving a fresh copy from the network on every
	// admin load is wasteful. A short-TTL in-memory copy means repeat loads
	// within the window are O(1); a Refresh still re-scans on demand.
	cacheMu    sync.Mutex
	cacheValue *domain.DashboardStatsResponse
	cacheAt    time.Time
}

// dashboardCacheTTL is how long a computed dashboard stays hot in memory.
// Long enough that a couple of rapid loads (or a live chart refresh) don't
// re-scan every table, short enough that "current" stats are never minutes
// stale.
const dashboardCacheTTL = 30 * time.Second

// GetAdminByEmail implements AdminUsecase.
func (u *adminUsecase) GetAdminByEmail(email string) (*domain.Admin, error) {
	return u.repo.GetAdminByEmail(email)
}

func NewAdminUsecase(repo AdminRepository, studentRepo StudentRepository, contestRepo ContestRepository, submissionRepo SubmissionRepository, contestRegistrationRepo ContestRegistrationRepository, paymentRepo PaymentRepository, pageViewRepo PageViewRepository) AdminUsecase {
	return &adminUsecase{
		repo:                    repo,
		studentRepo:             studentRepo,
		contestRepo:             contestRepo,
		submissionRepo:          submissionRepo,
		contestRegistrationRepo: contestRegistrationRepo,
		paymentRepo:             paymentRepo,
		pageViewRepo:            pageViewRepo,
	}
}

// WithQuestionRepo attaches the question bank to the dashboard aggregation
// (client task 4). It is a separate builder method so the stable
// NewAdminUsecase signature used by existing unit tests is unchanged; a
// usecase that never gets a question repo simply reports zero question stats.
func (u *adminUsecase) WithQuestionRepo(q QuestionRepository) AdminUsecase {
	u.questionRepo = q
	return u
}

func (u *adminUsecase) AddAdmin(admin domain.Admin) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(admin.Password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	admin.Password = string(hash)
	return u.repo.AddAdmin(admin)
}

// UpdateAdmin performs a read-modify-write on the row keyed by id: the stored
// item is loaded first (404-equivalent ErrAdminNotFound when absent, so a PUT
// can never mint a brand-new admin), then only the non-nil fields of the
// update are merged. Email is not mutable through this path; the id is the
// single key the panel uses.
func (u *adminUsecase) UpdateAdmin(id string, update AdminUpdate) error {
	existing, err := u.repo.GetAdminByID(id)
	if err != nil {
		return err
	}
	if existing == nil {
		return ErrAdminNotFound
	}
	if update.Name != nil && *update.Name != "" {
		existing.Name = *update.Name
	}
	if update.IsApproved != nil {
		existing.IsApproved = *update.IsApproved
	}
	if update.Password != nil && *update.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(*update.Password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		existing.Password = string(hash)
	}
	return u.repo.UpdateAdmin(id, *existing)
}

// DeleteAdmin removes the row keyed by id, answering ErrAdminNotFound for an
// unknown id so a typo cannot silently "succeed" against a non-existent key.
func (u *adminUsecase) DeleteAdmin(id string) error {
	existing, err := u.repo.GetAdminByID(id)
	if err != nil {
		return err
	}
	if existing == nil {
		return ErrAdminNotFound
	}
	return u.repo.DeleteAdmin(id)
}
func (u *adminUsecase) GetAdminByID(id string) (*domain.Admin, error) {
	return u.repo.GetAdminByID(id)
}
func (u *adminUsecase) GetAllAdmins() ([]domain.Admin, error) {
	return u.repo.GetAllAdmins()
}
func (u *adminUsecase) SignIn(email, password string) (*domain.Admin, error) {
	admin, err := u.repo.GetAdminByEmail(email)
	if err != nil {
		return nil, err
	}
	if admin == nil || admin.Password == "" {
		return nil, ErrInvalidCredentials
	}

	hashed := strings.HasPrefix(admin.Password, "$2")
	ok := false
	if hashed {
		ok = bcrypt.CompareHashAndPassword([]byte(admin.Password), []byte(password)) == nil
	} else {
		// Legacy plaintext record: compare, then upgrade to a hash on success.
		ok = subtle.ConstantTimeCompare([]byte(admin.Password), []byte(password)) == 1
	}
	if !ok {
		return nil, ErrInvalidCredentials
	}

	// Credentials are valid but the account still awaits approval by another
	// admin. Bootstrap rule: when no approved admin exists at all — a fresh
	// install, or admins created before the approval gate shipped — the first
	// valid login approves itself, so the panel can never be locked out.
	// Once any approved admin exists, every other account keeps needing an
	// approved admin's approval (the handler answers 403).
	if !admin.IsApproved {
		anyApproved, err := u.hasApprovedAdmin()
		if err != nil {
			return nil, err
		}
		if anyApproved {
			return nil, ErrNotApproved
		}
		admin.IsApproved = true
		if err := u.repo.UpdateAdmin(admin.ID, *admin); err != nil {
			return nil, err
		}
	}

	if !hashed {
		if hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost); err == nil {
			admin.Password = string(hash)
			_ = u.repo.UpdateAdmin(admin.ID, *admin)
		}
	}
	admin.Password = ""
	return admin, nil
}

// hasApprovedAdmin reports whether at least one approved admin exists.
func (u *adminUsecase) hasApprovedAdmin() (bool, error) {
	admins, err := u.repo.GetAllAdmins()
	if err != nil {
		return false, err
	}
	for i := range admins {
		if admins[i].IsApproved {
			return true, nil
		}
	}
	return false, nil
}

// GetDashboardStats returns the system statistics, serving the cached
// aggregate when it is still hot (client task 4 / performance) and
// recomputing on a full set of table scans otherwise. Callers receive a
// shared pointer that must be treated as read-only (the handler only
// JSON-encodes it); any mutation would corrupt the in-memory copy.
func (u *adminUsecase) GetDashboardStats() (*domain.DashboardStatsResponse, error) {
	if cached, ok := u.cachedDashboard(); ok {
		return cached, nil
	}
	resp, err := u.computeDashboardStats()
	if err != nil {
		return nil, err
	}
	u.storeDashboard(resp)
	return resp, nil
}

// RefreshDashboardStats bypasses the cache and recomputes the dashboard from
// the live tables. The /api/admin/dashboard route exposes it via ?refresh=1
// so an admin can pull up-to-date numbers on demand.
func (u *adminUsecase) RefreshDashboardStats() (*domain.DashboardStatsResponse, error) {
	resp, err := u.computeDashboardStats()
	if err != nil {
		return nil, err
	}
	u.storeDashboard(resp)
	return resp, nil
}

// computeDashboardStats runs the actual aggregation: one scan per table
// (students, contests, submissions, payments, registrations, page views,
// questions) and single-pass in-memory summarization over each. The full
// system-statistics surface lives here so a single endpoint returns every
// metric the admin dashboard needs (client task 4).
func (u *adminUsecase) computeDashboardStats() (*domain.DashboardStatsResponse, error) {
	// Get all required data
	students, err := u.studentRepo.GetStudents()
	if err != nil {
		return nil, err
	}

	contests, err := u.contestRepo.GetAllContests()
	if err != nil {
		return nil, err
	}

	submissions, err := u.submissionRepo.GetAllSubmissions()
	if err != nil {
		return nil, err
	}

	payments, err := u.paymentRepo.ListAll()
	if err != nil {
		return nil, err
	}

	// Real contest registrations (issue #3): one table scan via ListAll
	// instead of the old per-contest GSI fan-out (N+1).
	registrations, err := u.fetchRegistrations()
	if err != nil {
		return nil, err
	}

	// Question bank for the dashboard's question-stats block (client task 4).
	// A nil questionRepo (unit tests / stripped wiring) yields an empty,
	// well-formed shape so the response stays valid.
	var questions []domain.Question
	if u.questionRepo != nil {
		questions, err = u.questionRepo.GetAllQuestions()
		if err != nil {
			return nil, err
		}
	}

	// Calculate overview stats
	overviewStats := u.calculateOverviewStats(students, contests, registrations, payments)

	// Calculate user stats (submissions drive the participation-aware
	// additions; no extra queries are issued — issue #5).
	userStats := u.calculateUserStats(students, submissions)

	// Calculate contest stats
	contestStats := u.calculateContestStats(contests, submissions)

	// Calculate page view stats
	pageViewStats, err := u.calculatePageViewStats()
	if err != nil {
		// If page view data is not available, create empty stats
		pageViewStats = &domain.PageViewStats{
			TotalViews:     0,
			UniqueVisitors: 0,
			ViewsByPage:    make(map[string]int),
			ViewsByDay:     make([]int, 30),
			TopPages:       make([]domain.PageViewSummary, 0),
		}
	}

	// Get recent activity
	recentActivity := u.getRecentActivity(contests, submissions)

	// Question-bank and payments-ledger stats (client task 4), derived in the
	// same single passes so they add no extra queries.
	questionStats := u.calculateQuestionStats(questions)
	paymentStats := u.calculatePaymentStats(payments)

	return &domain.DashboardStatsResponse{
		Overview:       overviewStats,
		UserStats:      userStats,
		ContestStats:   contestStats,
		PageViewStats:  *pageViewStats,
		RecentActivity: recentActivity,
		QuestionStats:  questionStats,
		PaymentStats:   paymentStats,
		// Freshness marker (issue #5): stats are computed request-time from
		// full scans, so the admin UI can show exactly when they were built.
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// cachedDashboard returns the in-memory dashboard if it was computed within
// dashboardCacheTTL, else reports a miss. Safe for concurrent use.
func (u *adminUsecase) cachedDashboard() (*domain.DashboardStatsResponse, bool) {
	u.cacheMu.Lock()
	defer u.cacheMu.Unlock()
	if u.cacheValue != nil && time.Since(u.cacheAt) < dashboardCacheTTL {
		return u.cacheValue, true
	}
	return nil, false
}

// storeDashboard publishes a freshly computed dashboard into the in-memory
// cache. Safe for concurrent use.
func (u *adminUsecase) storeDashboard(resp *domain.DashboardStatsResponse) {
	u.cacheMu.Lock()
	defer u.cacheMu.Unlock()
	u.cacheValue = resp
	u.cacheAt = time.Now()
}

// fetchRegistrations returns every contest registration row with a single
// ListAll scan of the registrations table (issue #3). Both active and
// pending-approval (IsActive=false) rows count as registrations. The old
// implementation issued one GetRegistrationsByContest query per contest
// (N+1); results are equivalent for registrations of existing contests, and
// orphan rows of deleted contests now count too — which is the truthful
// registration count for the dashboard anyway.
func (u *adminUsecase) fetchRegistrations() ([]domain.ContestRegistration, error) {
	return u.contestRegistrationRepo.ListAll()
}

func (u *adminUsecase) calculateOverviewStats(students []domain.Student, contests []domain.Contest, registrations []domain.ContestRegistration, payments []domain.PaymentRequest) domain.OverviewStats {
	// Calculate total users with trend
	totalUsers := len(students)
	userTrendData := u.calculateUserTrendData(students)
	userTrend, userChange := u.calculateTrend(userTrendData)

	// Calculate total contests with trend
	totalContests := len(contests)
	contestTrendData := u.calculateContestTrendData(contests)
	contestTrend, contestChange := u.calculateTrend(contestTrendData)

	// Calculate revenue with trend
	revenue := u.calculateRevenue(payments)
	revenueTrendData := u.calculateRevenueTrendData(payments)
	revenueTrend, revenueChange := u.calculateTrend(revenueTrendData)

	// Calculate registrations with trend
	totalRegistrations := len(registrations)
	registrationTrendData := u.calculateRegistrationTrendData(registrations)
	registrationTrend, registrationChange := u.calculateTrend(registrationTrendData)

	return domain.OverviewStats{
		TotalUsers: domain.StatWithTrend{
			Value:  strconv.Itoa(totalUsers),
			Trend:  userTrend,
			Change: userChange,
			Data:   userTrendData,
		},
		TotalContests: domain.StatWithTrend{
			Value:  strconv.Itoa(totalContests),
			Trend:  contestTrend,
			Change: contestChange,
			Data:   contestTrendData,
		},
		Revenue: domain.StatWithTrend{
			// Amounts are Ethiopian bank-transfer values stored in ETB, so the
			// label says ETB instead of the old fake "$" (issue #37).
			Value:  fmt.Sprintf("ETB %.2f", revenue),
			Trend:  revenueTrend,
			Change: revenueChange,
			Data:   revenueTrendData,
		},
		Registrations: domain.StatWithTrend{
			Value:  strconv.Itoa(totalRegistrations),
			Trend:  registrationTrend,
			Change: registrationChange,
			Data:   registrationTrendData,
		},
	}
}

func (u *adminUsecase) calculateUserStats(students []domain.Student, submissions []domain.Submission) domain.UserStats {
	// Calculate city distribution
	cityMap := make(map[string]int)
	// Gender bucketing (issue #5): EVERY student lands in exactly one of the
	// four normalized buckets — the old code dropped "M"/"F"/empty values
	// entirely, so the gender charts never summed to the total.
	genderCounts := map[string]int{
		genderMale:    0,
		genderFemale:  0,
		genderOther:   0,
		genderUnknown: 0,
	}
	gradeMap := make(map[string]int)

	// Resolve which students actually participated: submissions may reference
	// a student by ID or by Telegram handle, so index every raw key and match
	// both student fields (same convention as the contest statistics usecase).
	participantKeys := make(map[string]bool, len(submissions)*2)
	submissionsByKey := make(map[string]int, len(submissions)*2)
	for _, sub := range submissions {
		// StudentID and Student.ID usually hold the SAME value; count a
		// submission once per distinct key so per-school totals stay true.
		seenKey := make(map[string]bool, 2)
		for _, key := range []string{sub.StudentID, sub.Student.ID} {
			if key == "" || seenKey[key] {
				continue
			}
			seenKey[key] = true
			participantKeys[key] = true
			submissionsByKey[key]++
		}
	}
	participates := func(s domain.Student) bool {
		return participantKeys[s.ID] || participantKeys[s.TelegramID]
	}
	submissionCountFor := func(s domain.Student) int {
		if n := submissionsByKey[s.ID]; n > 0 {
			return n
		}
		return submissionsByKey[s.TelegramID]
	}

	type gradeAgg struct{ students, participating int }
	type schoolAgg struct {
		city          string
		students      int
		participating int
		submissions   int
	}
	gradeAggs := make(map[string]*gradeAgg)
	schoolAggs := make(map[string]*schoolAgg)

	for _, student := range students {
		// City distribution
		if student.City != "" {
			cityMap[student.City]++
		}

		// Gender distribution — normalizes aliases and never drops a row.
		genderCounts[normalizeGender(student.Gender)]++

		// Grade distribution
		if student.Grade != "" {
			gradeMap[student.Grade]++
			ga := gradeAggs[student.Grade]
			if ga == nil {
				ga = &gradeAgg{}
				gradeAggs[student.Grade] = ga
			}
			ga.students++
			if participates(student) {
				ga.participating++
			}
		}

		// School aggregation for the top-schools participation list (issue #5).
		if student.School != "" {
			sa := schoolAggs[student.School]
			if sa == nil {
				sa = &schoolAgg{}
				schoolAggs[student.School] = sa
			}
			if sa.city == "" && student.City != "" {
				sa.city = student.City
			}
			sa.students++
			if participates(student) {
				sa.participating++
			}
			sa.submissions += submissionCountFor(student)
		}
	}

	totalStudents := len(students)

	// Convert city map to sorted slice
	cityDistribution := make([]domain.CityDistribution, 0, len(cityMap))
	for city, count := range cityMap {
		percentage := float64(count) / float64(totalStudents) * 100
		cityDistribution = append(cityDistribution, domain.CityDistribution{
			City:       city,
			Count:      count,
			Percentage: math.Round(percentage*100) / 100,
		})
	}

	// Sort by count descending
	sort.Slice(cityDistribution, func(i, j int) bool {
		return cityDistribution[i].Count > cityDistribution[j].Count
	})

	// Convert grade map to sorted slice
	gradeDistribution := make([]domain.GradeDistribution, 0, len(gradeMap))
	for grade, count := range gradeMap {
		percentage := float64(count) / float64(totalStudents) * 100
		gradeDistribution = append(gradeDistribution, domain.GradeDistribution{
			Grade:      grade,
			Count:      count,
			Percentage: math.Round(percentage*100) / 100,
		})
	}

	// Sort by grade
	sort.Slice(gradeDistribution, func(i, j int) bool {
		return gradeDistribution[i].Grade < gradeDistribution[j].Grade
	})

	// Participation rate per grade (issue #5): students in the grade with at
	// least one submission over students in the grade.
	gradeParticipation := make([]domain.GradeParticipationStat, 0, len(gradeAggs))
	for grade, ga := range gradeAggs {
		rate := 0.0
		if ga.students > 0 {
			rate = float64(ga.participating) / float64(ga.students) * 100
		}
		gradeParticipation = append(gradeParticipation, domain.GradeParticipationStat{
			Grade:             grade,
			Students:          ga.students,
			Participating:     ga.participating,
			ParticipationRate: math.Round(rate*100) / 100,
		})
	}
	sort.Slice(gradeParticipation, func(i, j int) bool {
		return gradeParticipation[i].Grade < gradeParticipation[j].Grade
	})

	// Top 10 schools by participation (issue #5).
	topSchools := make([]domain.SchoolParticipationStat, 0, len(schoolAggs))
	for school, sa := range schoolAggs {
		rate := 0.0
		if sa.students > 0 {
			rate = float64(sa.participating) / float64(sa.students) * 100
		}
		topSchools = append(topSchools, domain.SchoolParticipationStat{
			School:            school,
			City:              sa.city,
			Students:          sa.students,
			Participating:     sa.participating,
			ParticipationRate: math.Round(rate*100) / 100,
			Submissions:       sa.submissions,
		})
	}
	sort.Slice(topSchools, func(i, j int) bool {
		if topSchools[i].Participating != topSchools[j].Participating {
			return topSchools[i].Participating > topSchools[j].Participating
		}
		return topSchools[i].School < topSchools[j].School
	})
	if len(topSchools) > 10 {
		topSchools = topSchools[:10]
	}

	// Calculate growth trend (30-day data points)
	growthTrend := u.calculateUserTrendData(students)

	return domain.UserStats{
		ByCity: cityDistribution,
		ByGender: domain.GenderDistribution{
			Male:    genderCounts[genderMale],
			Female:  genderCounts[genderFemale],
			Other:   genderCounts[genderOther],
			Unknown: genderCounts[genderUnknown],
			Total:   totalStudents,
		},
		ByGrade:            gradeDistribution,
		GrowthTrend:        growthTrend,
		GradeParticipation: gradeParticipation,
		TopSchools:         topSchools,
	}
}

func (u *adminUsecase) calculateContestStats(contests []domain.Contest, submissions []domain.Submission) domain.ContestStats {
	// Calculate participation data (30-day trend)
	participationData := u.calculateParticipationTrendData(submissions)

	// Calculate status distribution
	statusMap := make(map[string]int)
	now := time.Now()

	for _, contest := range contests {
		startTime, startOK := parseContestTime(contest.StartTime)
		endTime, endOK := parseContestTime(contest.EndTime)
		if !startOK || !endOK {
			// Safer classification (issue #38): an unknown schedule is shown
			// as upcoming rather than being silently dropped or miscounted.
			statusMap["upcoming"]++
			continue
		}

		if now.Before(startTime) {
			statusMap["upcoming"]++
		} else if now.After(endTime) {
			statusMap["completed"]++
		} else {
			statusMap["active"]++
		}
	}

	// Calculate subject distribution
	subjectMap := make(map[string]int)
	for _, contest := range contests {
		if contest.Subject != "" {
			subjectMap[contest.Subject]++
		}
	}

	totalContests := len(contests)
	subjectDistribution := make([]domain.SubjectStat, 0, len(subjectMap))
	for subject, count := range subjectMap {
		percentage := float64(count) / float64(totalContests) * 100
		subjectDistribution = append(subjectDistribution, domain.SubjectStat{
			Subject:    subject,
			Count:      count,
			Percentage: math.Round(percentage*100) / 100,
		})
	}

	// Sort by count descending
	sort.Slice(subjectDistribution, func(i, j int) bool {
		return subjectDistribution[i].Count > subjectDistribution[j].Count
	})

	// Subject score stats (issue #5): average + median score per subject,
	// derived from the submissions and contests already fetched (the
	// submission row itself does not persist the contest document, so the
	// subject is resolved through the contestID -> subject map below).
	subjectByContest := make(map[string]string, len(contests))
	for _, contest := range contests {
		if contest.Subject != "" {
			subjectByContest[contest.ID] = contest.Subject
		}
	}
	type scoreAgg struct {
		count  int
		sum    float64
		scores []float64
	}
	subjectScoresMap := make(map[string]*scoreAgg)
	submissionStats := domain.SubmissionStats{Total: len(submissions)}
	uniqueStudents := make(map[string]bool, len(submissions))
	var allScores []float64
	for _, submission := range submissions {
		allScores = append(allScores, submission.Score)
		if !submission.SubmissionTime.IsZero() {
			submissionStats.Submitted++
		} else {
			// Legacy rows saved without a submission timestamp — surfaced
			// explicitly instead of pretending there is a status field that
			// domain.Submission does not have (issue #5).
			submissionStats.MissingTimestamp++
		}
		key := submission.StudentID
		if key == "" {
			key = submission.Student.ID
		}
		if key != "" {
			uniqueStudents[key] = true
		}
		subject := subjectByContest[submission.ContestID]
		if subject == "" {
			continue
		}
		agg := subjectScoresMap[subject]
		if agg == nil {
			agg = &scoreAgg{}
			subjectScoresMap[subject] = agg
		}
		agg.count++
		agg.sum += submission.Score
		agg.scores = append(agg.scores, submission.Score)
	}
	submissionStats.UniqueStudents = len(uniqueStudents)
	if len(allScores) > 0 {
		submissionStats.AverageScore = math.Round(sum(allScores)/float64(len(allScores))*100) / 100
		submissionStats.MedianScore = math.Round(medianOf(allScores)*100) / 100
	}

	subjectScoreStats := make([]domain.SubjectScoreStat, 0, len(subjectScoresMap))
	for subject, agg := range subjectScoresMap {
		avg := 0.0
		if agg.count > 0 {
			avg = agg.sum / float64(agg.count)
		}
		subjectScoreStats = append(subjectScoreStats, domain.SubjectScoreStat{
			Subject:     subject,
			Submissions: agg.count,
			Average:     math.Round(avg*100) / 100,
			Median:      math.Round(medianOf(agg.scores)*100) / 100,
		})
	}
	sort.Slice(subjectScoreStats, func(i, j int) bool {
		if subjectScoreStats[i].Submissions != subjectScoreStats[j].Submissions {
			return subjectScoreStats[i].Submissions > subjectScoreStats[j].Submissions
		}
		return subjectScoreStats[i].Subject < subjectScoreStats[j].Subject
	})

	return domain.ContestStats{
		ParticipationData: participationData,
		StatusDistribution: domain.StatusStats{
			Active:    statusMap["active"],
			Completed: statusMap["completed"],
			Upcoming:  statusMap["upcoming"],
		},
		SubjectDistribution: subjectDistribution,
		SubjectScores:       subjectScoreStats,
		SubmissionStats:     submissionStats,
	}
}

// sum adds up a float slice.
func sum(values []float64) float64 {
	var total float64
	for _, v := range values {
		total += v
	}
	return total
}

func (u *adminUsecase) getRecentActivity(contests []domain.Contest, submissions []domain.Submission) []domain.RecentContest {
	// Create a map to count participants per contest
	participantMap := make(map[string]int)
	for _, submission := range submissions {
		participantMap[submission.ContestID]++
	}

	// Convert contests to recent activity format
	recentActivity := make([]domain.RecentContest, 0, len(contests))
	for _, contest := range contests {
		// Parse start time through the shared helper (issue #38): an
		// unparseable schedule yields "N/A" rather than a fabricated "now".
		startTime, startOK := parseContestTime(contest.StartTime)
		endTime, endOK := parseContestTime(contest.EndTime)

		date := "N/A"
		if startOK {
			date = startTime.Format("2006-01-02")
		}

		// Determine status
		status := "Offline"
		if contest.Status == "active" {
			status = "Online"
		}

		// Calculate total time (duration between start and end)
		totalTime := "N/A"
		if startOK && endOK {
			duration := endTime.Sub(startTime)
			hours := int(duration.Hours())
			minutes := int(duration.Minutes()) % 60
			totalTime = fmt.Sprintf("%dh %dm", hours, minutes)
		}

		recentActivity = append(recentActivity, domain.RecentContest{
			ID:            contest.ID,
			Title:         contest.Title,
			Status:        status,
			Users:         participantMap[contest.ID],
			Subject:       contest.Subject,
			QuestionCount: len(contest.Questions),
			TotalTime:     totalTime,
			Date:          date,
		})
	}

	// Sort by date descending (most recent first)
	sort.Slice(recentActivity, func(i, j int) bool {
		dateI, _ := time.Parse("2006-01-02", recentActivity[i].Date)
		dateJ, _ := time.Parse("2006-01-02", recentActivity[j].Date)
		return dateI.After(dateJ)
	})

	// Return only the most recent 10 contests
	if len(recentActivity) > 10 {
		recentActivity = recentActivity[:10]
	}

	return recentActivity
}

func (u *adminUsecase) calculateRevenue(payments []domain.PaymentRequest) float64 {
	// Revenue is the sum of real approved amounts on bank-transfer payment
	// requests (ETB); Telegram Stars payments are not persisted per-payment in
	// this data model, so only bank payments contribute.
	var totalRevenue float64
	for _, payment := range payments {
		if payment.Status == domain.StatusApproved {
			totalRevenue += payment.Amount
		}
	}
	return totalRevenue
}

// dayWindow is one calendar-day bucket of the 30-day trend series: the half
// interval (start, start+24h) compared with the same STRICT After/Before
// checks the original O(30n) loops used (an instant exactly on local midnight
// belongs to no window — preserved deliberately so results are identical).
type dayWindow struct {
	start time.Time
	end   time.Time
}

// buildDayWindows returns the 30 consecutive day windows ending at "now",
// constructed exactly like the original per-index loop did
// (now.AddDate(0,0,-29+i) -> local midnight -> +24h).
func buildDayWindows(now time.Time) []dayWindow {
	windows := make([]dayWindow, 30)
	for i := range 30 {
		targetDate := now.AddDate(0, 0, -29+i)
		startOfDay := time.Date(targetDate.Year(), targetDate.Month(), targetDate.Day(), 0, 0, 0, 0, targetDate.Location())
		windows[i] = dayWindow{start: startOfDay, end: startOfDay.Add(24 * time.Hour)}
	}
	return windows
}

// bucketInstant adds 1 to every window containing t, using the identical
// After(start)/Before(end) tests as the original nested loops. Window starts
// are strictly increasing, so at most the two windows before the binary
// search boundary can match (calendar days shorter than 12h do not exist in
// practice); checking both keeps the result identical even across 23h/25h
// DST days where adjacent windows overlap or gap.
func bucketInstant(windows []dayWindow, counts []int, t time.Time) {
	lo, hi := 0, len(windows)
	for lo < hi {
		mid := (lo + hi) / 2
		if windows[mid].start.Before(t) {
			lo = mid + 1
		} else {
			hi = mid
		}
	}
	for _, i := range [2]int{lo - 2, lo - 1} {
		if i >= 0 && i < len(windows) && t.After(windows[i].start) && t.Before(windows[i].end) {
			counts[i]++
		}
	}
}

// calculateQuestionStats summarizes the stored question bank in a single
// in-memory pass (client task 4): no extra DynamoDB round-trips beyond the
// one GetAllQuestions scan already needed for the contest detail. A nil
// questionRepo (unit tests / stripped wiring) yields an empty, well-formed
// shape so the response stays valid.
func (u *adminUsecase) calculateQuestionStats(questions []domain.Question) domain.QuestionStats {
	stats := domain.QuestionStats{
		Total:     len(questions),
		BySubject: []domain.SubjectStat{},
		ByGrade:   []domain.GradeDistribution{},
	}
	if len(questions) == 0 {
		return stats
	}

	subjectCounts := make(map[string]int)
	gradeCounts := make(map[string]int)
	for _, q := range questions {
		if q.Subject != "" {
			subjectCounts[q.Subject]++
		}
		if q.Grade != "" {
			gradeCounts[q.Grade]++
		}
		if q.Explanation != "" {
			stats.WithExplanation++
		}
		if q.QuestionImg != "" {
			stats.WithImage++
		}
	}

	total := len(questions)
	stats.BySubject = make([]domain.SubjectStat, 0, len(subjectCounts))
	for subject, count := range subjectCounts {
		stats.BySubject = append(stats.BySubject, domain.SubjectStat{
			Subject:    subject,
			Count:      count,
			Percentage: math.Round(float64(count)/float64(total)*100*100) / 100,
		})
	}
	sort.Slice(stats.BySubject, func(i, j int) bool {
		return stats.BySubject[i].Count > stats.BySubject[j].Count
	})

	stats.ByGrade = make([]domain.GradeDistribution, 0, len(gradeCounts))
	for grade, count := range gradeCounts {
		stats.ByGrade = append(stats.ByGrade, domain.GradeDistribution{
			Grade:      grade,
			Count:      count,
			Percentage: math.Round(float64(count)/float64(total)*100*100) / 100,
		})
	}
	sort.Slice(stats.ByGrade, func(i, j int) bool {
		return stats.ByGrade[i].Grade < stats.ByGrade[j].Grade
	})

	return stats
}

// calculatePaymentStats summarizes the payments ledger in a single in-memory
// pass over the ListAll scan the dashboard already performs (client task 4):
// status breakdown, approved revenue, and a 30-day request trend.
func (u *adminUsecase) calculatePaymentStats(payments []domain.PaymentRequest) domain.PaymentStats {
	stats := domain.PaymentStats{
		Total:    len(payments),
		ByStatus: []domain.PaymentStatusStat{},
		Trend:    make([]int, 30),
	}
	if len(payments) == 0 {
		return stats
	}

	statusCounts := make(map[domain.PaymentStatus]int)
	now := time.Now()
	trendCounts := make(map[[2]int]int, len(payments))
	for _, p := range payments {
		statusCounts[p.Status]++
		if p.Status == domain.StatusApproved {
			stats.ApprovedRevenue += p.Amount
		}
		// A request created on any day counts toward that day's trend,
		// regardless of its current status.
		created := p.CreatedAt
		if created.IsZero() {
			created = p.UpdatedAt
		}
		if !created.IsZero() {
			trendCounts[dayKey(created)]++
		}
	}

	for _, st := range []domain.PaymentStatus{domain.StatusPending, domain.StatusApproved, domain.StatusRejected} {
		count := statusCounts[st]
		percentage := 0.0
		if stats.Total > 0 {
			percentage = math.Round(float64(count)/float64(stats.Total)*100*100) / 100
		}
		stats.ByStatus = append(stats.ByStatus, domain.PaymentStatusStat{
			Status:     string(st),
			Count:      count,
			Percentage: percentage,
		})
		switch st {
		case domain.StatusPending:
			stats.Pending = count
		case domain.StatusApproved:
			stats.Approved = count
		case domain.StatusRejected:
			stats.Rejected = count
		}
	}

	for i := 0; i < 30; i++ {
		target := now.AddDate(0, 0, -29+i)
		stats.Trend[i] = trendCounts[dayKey(target)]
	}

	return stats
}

func (u *adminUsecase) calculateUserTrendData(students []domain.Student) []int {
	// Single-pass trend bucketing (issue #3): the original algorithm scanned
	// the whole student slice once per day (O(30n)); this walks it once into
	// a day-index map. Results are identical for the same input.
	now := time.Now()
	trendData := make([]int, 30)

	// Count students with valid CreatedAt timestamps
	studentsWithTimestamps := 0
	studentsWithoutTimestamps := 0
	for _, student := range students {
		if student.CreatedAt.IsZero() {
			studentsWithoutTimestamps++
		} else {
			studentsWithTimestamps++
		}
	}

	// If most students don't have timestamps, distribute them evenly across the last 30 days
	if studentsWithoutTimestamps > studentsWithTimestamps {
		// Distribute students without timestamps evenly across the 30 days
		studentsPerDay := studentsWithoutTimestamps / 30
		remainder := studentsWithoutTimestamps % 30

		for i := range 30 {
			count := studentsPerDay
			if i < remainder {
				count++ // Distribute remainder across first few days
			}
			trendData[i] = count
		}
	}

	// Bucket every student that has a valid timestamp into its day window
	// (both branches of the original code added these with the same strict
	// After/Before comparison).
	windows := buildDayWindows(now)
	for _, student := range students {
		if student.CreatedAt.IsZero() {
			continue
		}
		bucketInstant(windows, trendData, student.CreatedAt)
	}

	return trendData
}

// dayKey reduces a timestamp to the same (year, year-day) equality the
// original per-day loops compared on.
func dayKey(t time.Time) [2]int {
	return [2]int{t.Year(), t.YearDay()}
}

func (u *adminUsecase) calculateContestTrendData(contests []domain.Contest) []int {
	// Single-pass contest bucketing (issue #3): one walk of the contests
	// into a (year, yearDay) -> count map, then the 30 slices are emitted by
	// lookup. Identical results for the same input.
	now := time.Now()
	trendData := make([]int, 30)

	counts := make(map[[2]int]int, len(contests))
	for _, contest := range contests {
		// Shared parser (issue #38): same layout set as status
		// classification; contests with unparseable start times have no
		// date to bucket and are excluded here (and shown as "upcoming"
		// in the status distribution).
		startTime, ok := parseContestTime(contest.StartTime)
		if !ok {
			continue
		}
		counts[dayKey(startTime)]++
	}

	for i := range 30 {
		targetDate := now.AddDate(0, 0, -29+i)
		trendData[i] = counts[dayKey(targetDate)]
	}

	return trendData
}

func (u *adminUsecase) calculateRevenueTrendData(payments []domain.PaymentRequest) []int {
	// Single-pass revenue bucketing (issue #3). Payments are accumulated per
	// day in input order, exactly like the original inner loop, so the
	// float sums (and their int truncation) are bit-identical.
	now := time.Now()
	trendData := make([]int, 30)

	revenue := make(map[[2]int]float64, len(payments))
	for _, payment := range payments {
		// Real approved bank-transfer amounts (ETB), not a per-payment
		// placeholder (issue #37).
		if payment.Status != domain.StatusApproved {
			continue
		}
		revenue[dayKey(payment.UpdatedAt)] += payment.Amount
	}

	for i := range 30 {
		targetDate := now.AddDate(0, 0, -29+i)
		trendData[i] = int(revenue[dayKey(targetDate)])
	}

	return trendData
}

func (u *adminUsecase) calculateRegistrationTrendData(registrations []domain.ContestRegistration) []int {
	// Single-pass registration bucketing (issue #3) from real
	// contest-registration timestamps, not submissions (issue #37).
	now := time.Now()
	trendData := make([]int, 30)

	counts := make(map[[2]int]int, len(registrations))
	for _, registration := range registrations {
		registeredAt := registration.RegisteredAt
		if registeredAt.IsZero() {
			continue
		}
		counts[dayKey(registeredAt)]++
	}

	for i := range 30 {
		targetDate := now.AddDate(0, 0, -29+i)
		trendData[i] = counts[dayKey(targetDate)]
	}

	return trendData
}

func (u *adminUsecase) calculateParticipationTrendData(submissions []domain.Submission) []int {
	// Generate 12-month participation trend data (monthly data)
	now := time.Now()
	trendData := make([]int, 12)

	for i := 0; i < 12; i++ {
		// Go back i months from current month
		targetMonth := now.AddDate(0, -11+i, 0)
		count := 0

		for _, submission := range submissions {
			if submission.SubmissionTime.Year() == targetMonth.Year() &&
				submission.SubmissionTime.Month() == targetMonth.Month() {
				count++
			}
		}

		trendData[i] = count
	}

	return trendData
}

func (u *adminUsecase) calculateTrend(data []int) (string, string) {
	if len(data) < 2 {
		return "neutral", "0%"
	}

	// Compare last value with previous value
	current := data[len(data)-1]
	previous := data[len(data)-2]

	if current > previous {
		// Handle division by zero
		if previous == 0 {
			return "up", "+100%"
		}
		change := float64(current-previous) / float64(previous) * 100
		// Check for infinity or NaN
		if math.IsInf(change, 0) || math.IsNaN(change) {
			return "up", "+100%"
		}
		return "up", fmt.Sprintf("+%.1f%%", change)
	} else if current < previous {
		// Handle division by zero
		if previous == 0 {
			return "neutral", "0%"
		}
		change := float64(previous-current) / float64(previous) * 100
		// Check for infinity or NaN
		if math.IsInf(change, 0) || math.IsNaN(change) {
			return "down", "-100%"
		}
		return "down", fmt.Sprintf("-%.1f%%", change)
	}

	return "neutral", "0%"
}

func (u *adminUsecase) calculatePageViewStats() (*domain.PageViewStats, error) {
	// Get page views for the last 30 days
	endDate := time.Now()
	startDate := endDate.AddDate(0, 0, -30)

	pageViews, err := u.pageViewRepo.GetPageViewsByDateRange(startDate, endDate)
	if err != nil {
		return nil, err
	}

	// Calculate total views
	totalViews := len(pageViews)

	// Calculate unique visitors
	uniqueVisitors := make(map[string]bool)
	viewsByPage := make(map[string]int)
	viewsByDay := make([]int, 30)

	for _, pv := range pageViews {
		// Count unique visitors (by user_id or ip_address if no user_id)
		visitorKey := pv.UserID
		if visitorKey == "" {
			visitorKey = pv.IPAddress
		}
		uniqueVisitors[visitorKey] = true

		// Count views by page
		viewsByPage[pv.Page]++

		// Count views by day
		dayIndex := int(endDate.Sub(pv.ViewedAt).Hours() / 24)
		if dayIndex >= 0 && dayIndex < 30 {
			viewsByDay[29-dayIndex]++
		}
	}

	// Calculate top pages
	type pageCount struct {
		page  string
		count int
	}

	var pageCounts []pageCount
	for page, count := range viewsByPage {
		pageCounts = append(pageCounts, pageCount{page: page, count: count})
	}

	// Sort by count descending
	sort.Slice(pageCounts, func(i, j int) bool {
		return pageCounts[i].count > pageCounts[j].count
	})

	// Create top pages summary (limit to top 10)
	topPages := make([]domain.PageViewSummary, 0)
	for i, pc := range pageCounts {
		if i >= 10 {
			break
		}
		percentage := float64(pc.count) / float64(totalViews) * 100
		if totalViews == 0 {
			percentage = 0
		}
		topPages = append(topPages, domain.PageViewSummary{
			Page:       pc.page,
			Views:      pc.count,
			Percentage: math.Round(percentage*100) / 100,
		})
	}

	return &domain.PageViewStats{
		TotalViews:     totalViews,
		UniqueVisitors: len(uniqueVisitors),
		ViewsByPage:    viewsByPage,
		ViewsByDay:     viewsByDay,
		TopPages:       topPages,
	}, nil
}
