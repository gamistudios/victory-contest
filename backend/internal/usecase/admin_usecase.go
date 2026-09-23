package usecase

import (
	"crypto/subtle"
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
	"victor-contest-go/internal/domain"

	"golang.org/x/crypto/bcrypt"
)

var ErrInvalidCredentials = errors.New("invalid credentials")

// contestTimeLayouts is the superset of timestamp layouts observed in stored
// contest start/end times (issue #38): RFC 3339 (with Z or numeric offset)
// plus the legacy layouts — no-offset ISO, minute precision, and date only.
var contestTimeLayouts = []string{
	time.RFC3339,           // 2006-01-02T15:04:05Z07:00 (also covers ...Z)
	"2006-01-02T15:04:05",  // no timezone
	"2006-01-02T15:04",     // minute precision
	"2006-01-02",           // date only
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
	UpdateAdmin(id string, update domain.Admin) error
	DeleteAdmin(id string) error
	GetAdminByID(id string) (*domain.Admin, error)
	GetAllAdmins() ([]domain.Admin, error)
	SignIn(email, password string) (*domain.Admin, error)
	GetAdminByEmail(email string) (*domain.Admin, error)
	GetDashboardStats() (*domain.DashboardStatsResponse, error)
}

type adminUsecase struct {
	repo                    AdminRepository
	studentRepo             StudentRepository
	contestRepo             ContestRepository
	submissionRepo          SubmissionRepository
	contestRegistrationRepo ContestRegistrationRepository
	paymentRepo             PaymentRepository
	pageViewRepo            PageViewRepository
}

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

func (u *adminUsecase) AddAdmin(admin domain.Admin) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(admin.Password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	admin.Password = string(hash)
	return u.repo.AddAdmin(admin)
}
func (u *adminUsecase) UpdateAdmin(id string, update domain.Admin) error {
	if update.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(update.Password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		update.Password = string(hash)
	}
	return u.repo.UpdateAdmin(id, update)
}
func (u *adminUsecase) DeleteAdmin(id string) error {
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

	if !hashed {
		if hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost); err == nil {
			admin.Password = string(hash)
			_ = u.repo.UpdateAdmin(admin.ID, *admin)
		}
	}
	admin.Password = ""
	return admin, nil
}

func (u *adminUsecase) GetDashboardStats() (*domain.DashboardStatsResponse, error) {
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

	// Real contest registrations (issue #37): the repository has no
	// list-all method, so we fan out per contest via GetRegistrationsByContest.
	registrations, err := u.fetchRegistrations(contests)
	if err != nil {
		return nil, err
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

	return &domain.DashboardStatsResponse{
		Overview:       overviewStats,
		UserStats:      userStats,
		ContestStats:   contestStats,
		PageViewStats:  *pageViewStats,
		RecentActivity: recentActivity,
		// Freshness marker (issue #5): stats are computed request-time from
		// full scans, so the admin UI can show exactly when they were built.
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// fetchRegistrations returns every contest registration row across all
// contests. Both active and pending-approval (IsActive=false) rows count as
// registrations. ContestRegistrationRepository has no list-all method, so this
// is one query per contest (N+1) — noted as a follow-up for the repo layer.
func (u *adminUsecase) fetchRegistrations(contests []domain.Contest) ([]domain.ContestRegistration, error) {
	var all []domain.ContestRegistration
	for _, contest := range contests {
		regs, err := u.contestRegistrationRepo.GetRegistrationsByContest(contest.ID)
		if err != nil {
			return nil, err
		}
		all = append(all, regs...)
	}
	return all, nil
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
		count   int
		sum     float64
		scores  []float64
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

func (u *adminUsecase) calculateUserTrendData(students []domain.Student) []int {
	// Generate 30-day trend data for users (daily data)
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

		// Add students with valid timestamps to their respective days
		for i := range 30 {
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
		// Normal calculation for students with valid timestamps
		for i := range 30 {
			targetDate := now.AddDate(0, 0, -29+i)
			count := 0

			startOfDay := time.Date(targetDate.Year(), targetDate.Month(), targetDate.Day(), 0, 0, 0, 0, targetDate.Location())
			endOfDay := startOfDay.Add(24 * time.Hour)

			for _, student := range students {
				createdAt := student.CreatedAt

				// Skip students without valid timestamps
				if createdAt.IsZero() {
					continue
				}

				// Check if student was created on the target date
				if createdAt.After(startOfDay) && createdAt.Before(endOfDay) {
					count++
				}
			}

			trendData[i] = count
		}
	}

	return trendData
}

func (u *adminUsecase) calculateContestTrendData(contests []domain.Contest) []int {
	// Generate 30-day trend data for contests (daily data)
	now := time.Now()
	trendData := make([]int, 30)

	// Count contests created in each of the last 30 days
	for i := 0; i < 30; i++ {
		// Go back i days from current day
		targetDate := now.AddDate(0, 0, -29+i)
		count := 0

		for _, contest := range contests {
			// Shared parser (issue #38): same layout set as status
			// classification; contests with unparseable start times have no
			// date to bucket and are excluded here (and shown as "upcoming"
			// in the status distribution).
			startTime, ok := parseContestTime(contest.StartTime)
			if !ok {
				continue
			}

			// Check if contest was created on the target date
			if startTime.Year() == targetDate.Year() &&
				startTime.YearDay() == targetDate.YearDay() {
				count++
			}
		}

		trendData[i] = count
	}

	return trendData
}

func (u *adminUsecase) calculateRevenueTrendData(payments []domain.PaymentRequest) []int {
	// Generate 30-day revenue trend data (daily data)
	now := time.Now()
	trendData := make([]int, 30)

	for i := 0; i < 30; i++ {
		// Go back i days from current day
		targetDate := now.AddDate(0, 0, -29+i)
		revenue := 0.0

		for _, payment := range payments {
			// Real approved bank-transfer amounts (ETB), not a per-payment
			// placeholder (issue #37).
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

func (u *adminUsecase) calculateRegistrationTrendData(registrations []domain.ContestRegistration) []int {
	// Generate 30-day registration trend data (daily data) from real
	// contest-registration timestamps, not submissions (issue #37).
	now := time.Now()
	trendData := make([]int, 30)

	for i := 0; i < 30; i++ {
		// Go back i days from current day
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
