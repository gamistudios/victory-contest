package usecase

import (
	"fmt"
	"math"
	"sort"
	"sync"
	"time"
	"victory-contest-go/internal/domain"
)

type ContestStatisticsUsecase interface {
	GetContestStatistics(contestID string, filters domain.StatisticsFilters) (*domain.ContestStatistics, error)
	GetStudentPerformancesByContest(contestID string, filters domain.StatisticsFilters, page, pageSize int) (*domain.StudentPerformanceList, error)
	GetContestSummary(contestID string) (*domain.ContestStatistics, error)
}

type contestStatisticsUsecase struct {
	contestUsecase    ContestUsecase
	submissionUsecase SubmissionUsecase
	studentUsecase    StudentUsecase
	questionUsecase   QuestionUsecase
	statsRepo         ContestStatisticsRepository

	// Short-TTL cache for the per-contest aggregates (client task 5): each
	// call re-scans submissions + students (a GetStudents() alone is two full
	// scans), and the admin Statistics tab re-fires them on every filter
	// change. A hot copy keyed on the inputs makes repeat loads within the
	// window O(1) instead of N round-trips.
	cacheMu    sync.Mutex
	cacheStats map[string]*domain.ContestStatistics
	cachePerf  map[string]*domain.StudentPerformanceList
	cacheAt    map[string]time.Time
}

// contestStatsCacheTTL bounds how long a computed aggregate stays hot. Long
// enough that a rapid filter-toggle session doesn't re-scan every table,
// short enough that numbers are never minutes stale.
const contestStatsCacheTTL = 30 * time.Second

// contestStatsCacheKey builds the cache key for a statistics aggregate:
// method + contest + the filter fields (and page size where relevant).
func contestStatsCacheKey(method, contestID string, filters domain.StatisticsFilters, page, pageSize int) string {
	return method + "|" + contestID + "|" + filters.Gender + "|" + filters.City + "|" + filters.School + "|" + filters.Grade +
		"|" + itoaInt(page) + "/" + itoaInt(pageSize)
}

func itoaInt(n int) string {
	return fmt.Sprintf("%d", n)
}

func NewContestStatisticsUsecase(
	contestUsecase ContestUsecase,
	submissionUsecase SubmissionUsecase,
	studentUsecase StudentUsecase,
	questionUsecase QuestionUsecase,
	statsRepo ContestStatisticsRepository,
) ContestStatisticsUsecase {
	return &contestStatisticsUsecase{
		contestUsecase:    contestUsecase,
		submissionUsecase: submissionUsecase,
		studentUsecase:    studentUsecase,
		questionUsecase:   questionUsecase,
		statsRepo:         statsRepo,
		cacheStats:        make(map[string]*domain.ContestStatistics),
		cachePerf:         make(map[string]*domain.StudentPerformanceList),
		cacheAt:           make(map[string]time.Time),
	}
}

// contestStatsCacheGet / Set are the read/write halves of the short-TTL
// aggregate cache. Callers share the returned pointer (read-only: the
// handlers only JSON-encode it), and the cache self-evicts expired entries so
// a long-running process does not grow unbounded.
func (u *contestStatisticsUsecase) contestStatsCacheGet(key string) *domain.ContestStatistics {
	u.cacheMu.Lock()
	defer u.cacheMu.Unlock()
	v, ok := u.cacheStats[key]
	if ok && time.Since(u.cacheAt[key]) < contestStatsCacheTTL {
		return v
	}
	if len(u.cacheStats) > 512 {
		u.evictExpiredLocked()
	}
	return nil
}

func (u *contestStatisticsUsecase) contestStatsCacheSet(key string, v *domain.ContestStatistics) {
	u.cacheMu.Lock()
	defer u.cacheMu.Unlock()
	u.cacheStats[key] = v
	u.cacheAt[key] = time.Now()
}

func (u *contestStatisticsUsecase) perfCacheGet(key string) *domain.StudentPerformanceList {
	u.cacheMu.Lock()
	defer u.cacheMu.Unlock()
	v, ok := u.cachePerf[key]
	if ok && time.Since(u.cacheAt[key]) < contestStatsCacheTTL {
		return v
	}
	if len(u.cachePerf) > 512 {
		u.evictExpiredLocked()
	}
	return nil
}

func (u *contestStatisticsUsecase) perfCacheSet(key string, v *domain.StudentPerformanceList) {
	u.cacheMu.Lock()
	defer u.cacheMu.Unlock()
	u.cachePerf[key] = v
	u.cacheAt[key] = time.Now()
}

// evictExpiredLocked drops cache entries past the TTL (and their timestamps).
// Caller must hold cacheMu.
func (u *contestStatisticsUsecase) evictExpiredLocked() {
	now := time.Now()
	for k, at := range u.cacheAt {
		if now.Sub(at) >= contestStatsCacheTTL {
			delete(u.cacheStats, k)
			delete(u.cachePerf, k)
			delete(u.cacheAt, k)
		}
	}
}

// GetContestStatistics returns the contest aggregate, served from the
// short-TTL cache when hot and computed (then cached) otherwise. The
// underlying computation is in computeContestStatistics.
func (u *contestStatisticsUsecase) GetContestStatistics(contestID string, filters domain.StatisticsFilters) (*domain.ContestStatistics, error) {
	key := contestStatsCacheKey("stats", contestID, filters, 0, 0)
	if cached := u.contestStatsCacheGet(key); cached != nil {
		return cached, nil
	}
	stats, err := u.computeContestStatistics(contestID, filters)
	if err != nil {
		return nil, err
	}
	u.contestStatsCacheSet(key, stats)
	return stats, nil
}

func (u *contestStatisticsUsecase) computeContestStatistics(contestID string, filters domain.StatisticsFilters) (*domain.ContestStatistics, error) {
	// Get contest details
	contestObj, err := u.contestUsecase.GetContestByID(contestID)
	if err != nil {
		return nil, fmt.Errorf("failed to get contest: %w", err)
	}
	if contestObj == nil {
		return nil, fmt.Errorf("contest not found")
	}

	// Convert ContestTypeWithQuestionObj to Contest
	questionIDs := make([]string, len(contestObj.Questions))
	for i, q := range contestObj.Questions {
		questionIDs[i] = q.ID
	}
	contest := &domain.Contest{
		ID:          contestObj.ID,
		Title:       contestObj.Title,
		Description: contestObj.Description,
		StartTime:   contestObj.StartTime,
		EndTime:     contestObj.EndTime,
		Subject:     contestObj.Subject,
		Grade:       contestObj.Grade,
		Prize:       contestObj.Prize,
		Questions:   questionIDs,
		Status:      contestObj.Status,
		Type:        contestObj.Type,
	}

	// Get all submissions for this contest
	submissions, err := u.submissionUsecase.GetSubmissionsByContest(contestID)
	if err != nil {
		return nil, fmt.Errorf("failed to get submissions: %w", err)
	}

	// Get all students for mapping
	students, err := u.studentUsecase.GetStudents()
	if err != nil {
		return nil, fmt.Errorf("failed to get students: %w", err)
	}

	// Create student map for quick lookup
	studentMap := make(map[string]domain.Student)
	for _, student := range students {
		studentMap[student.ID] = student
		studentMap[student.TelegramID] = student
	}

	// Calculate total questions in contest
	totalQuestions := len(contest.Questions)

	// Process submissions and calculate statistics
	stats := u.calculateContestStatistics(submissions, studentMap, contest, totalQuestions, filters)

	return stats, nil
}

// GetStudentPerformancesByContest returns the per-student performance list,
// served from the short-TTL cache when hot and computed (then cached)
// otherwise. The underlying computation is in computeStudentPerformances.
func (u *contestStatisticsUsecase) GetStudentPerformancesByContest(contestID string, filters domain.StatisticsFilters, page, pageSize int) (*domain.StudentPerformanceList, error) {
	if pageSize <= 0 {
		pageSize = 10
	}
	key := contestStatsCacheKey("perf", contestID, filters, page, pageSize)
	if cached := u.perfCacheGet(key); cached != nil {
		return cached, nil
	}
	list, err := u.computeStudentPerformances(contestID, filters, page, pageSize)
	if err != nil {
		return nil, err
	}
	u.perfCacheSet(key, list)
	return list, nil
}

func (u *contestStatisticsUsecase) computeStudentPerformances(contestID string, filters domain.StatisticsFilters, page, pageSize int) (*domain.StudentPerformanceList, error) {
	// Get contest details
	contestObj, err := u.contestUsecase.GetContestByID(contestID)
	if err != nil {
		return nil, fmt.Errorf("failed to get contest: %w", err)
	}
	if contestObj == nil {
		return nil, fmt.Errorf("contest not found")
	}

	// Convert ContestTypeWithQuestionObj to Contest
	questionIDs := make([]string, len(contestObj.Questions))
	for i, q := range contestObj.Questions {
		questionIDs[i] = q.ID
	}
	contest := &domain.Contest{
		ID:          contestObj.ID,
		Title:       contestObj.Title,
		Description: contestObj.Description,
		StartTime:   contestObj.StartTime,
		EndTime:     contestObj.EndTime,
		Subject:     contestObj.Subject,
		Grade:       contestObj.Grade,
		Prize:       contestObj.Prize,
		Questions:   questionIDs,
		Status:      contestObj.Status,
		Type:        contestObj.Type,
	}

	// Get all submissions for this contest
	submissions, err := u.submissionUsecase.GetSubmissionsByContest(contestID)
	if err != nil {
		return nil, fmt.Errorf("failed to get submissions: %w", err)
	}

	// Get all students for mapping
	students, err := u.studentUsecase.GetStudents()
	if err != nil {
		return nil, fmt.Errorf("failed to get students: %w", err)
	}

	// Create student map for quick lookup
	studentMap := make(map[string]domain.Student)
	for _, student := range students {
		studentMap[student.ID] = student
		studentMap[student.TelegramID] = student
	}

	// Calculate total questions in contest
	totalQuestions := len(contest.Questions)

	// Process submissions and create performance list
	performances := u.calculateStudentPerformances(submissions, studentMap, contest, totalQuestions, filters)

	// Apply pagination
	totalCount := len(performances)
	startIndex := (page - 1) * pageSize
	endIndex := startIndex + pageSize

	if startIndex >= totalCount {
		return &domain.StudentPerformanceList{
			Students:   []domain.StudentContestPerformance{},
			TotalCount: totalCount,
			Page:       page,
			PageSize:   pageSize,
			TotalPages: int(math.Ceil(float64(totalCount) / float64(pageSize))),
		}, nil
	}

	if endIndex > totalCount {
		endIndex = totalCount
	}

	paginatedPerformances := performances[startIndex:endIndex]

	return &domain.StudentPerformanceList{
		Students:   paginatedPerformances,
		TotalCount: totalCount,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: int(math.Ceil(float64(totalCount) / float64(pageSize))),
	}, nil
}

// GetContestSummary returns the contest summary aggregate, served from the
// short-TTL cache when hot and computed (then cached) otherwise. The
// underlying computation is in computeContestSummary.
func (u *contestStatisticsUsecase) GetContestSummary(contestID string) (*domain.ContestStatistics, error) {
	key := contestStatsCacheKey("summary", contestID, domain.StatisticsFilters{}, 0, 0)
	if cached := u.contestStatsCacheGet(key); cached != nil {
		return cached, nil
	}
	stats, err := u.computeContestSummary(contestID)
	if err != nil {
		return nil, err
	}
	u.contestStatsCacheSet(key, stats)
	return stats, nil
}

func (u *contestStatisticsUsecase) computeContestSummary(contestID string) (*domain.ContestStatistics, error) {
	// Get contest details
	contestObj, err := u.contestUsecase.GetContestByID(contestID)
	if err != nil {
		return nil, fmt.Errorf("failed to get contest: %w", err)
	}
	if contestObj == nil {
		return nil, fmt.Errorf("contest not found")
	}

	// Convert ContestTypeWithQuestionObj to Contest
	questionIDs := make([]string, len(contestObj.Questions))
	for i, q := range contestObj.Questions {
		questionIDs[i] = q.ID
	}
	contest := &domain.Contest{
		ID:          contestObj.ID,
		Title:       contestObj.Title,
		Description: contestObj.Description,
		StartTime:   contestObj.StartTime,
		EndTime:     contestObj.EndTime,
		Subject:     contestObj.Subject,
		Grade:       contestObj.Grade,
		Prize:       contestObj.Prize,
		Questions:   questionIDs,
		Status:      contestObj.Status,
		Type:        contestObj.Type,
	}

	// Get all submissions for this contest
	submissions, err := u.submissionUsecase.GetSubmissionsByContest(contestID)
	if err != nil {
		return nil, fmt.Errorf("failed to get submissions: %w", err)
	}

	// Get all students for mapping
	students, err := u.studentUsecase.GetStudents()
	if err != nil {
		return nil, fmt.Errorf("failed to get students: %w", err)
	}

	// Create student map for quick lookup
	studentMap := make(map[string]domain.Student)
	for _, student := range students {
		studentMap[student.ID] = student
		studentMap[student.TelegramID] = student
	}

	// Calculate total questions in contest
	totalQuestions := len(contest.Questions)

	// Process submissions with no filters
	stats := u.calculateContestStatistics(submissions, studentMap, contest, totalQuestions, domain.StatisticsFilters{})

	return stats, nil
}

func (u *contestStatisticsUsecase) calculateContestStatistics(
	submissions []domain.Submission,
	studentMap map[string]domain.Student,
	contest *domain.Contest,
	totalQuestions int,
	filters domain.StatisticsFilters,
) *domain.ContestStatistics {
	// Group submissions by student (in case of multiple submissions)
	studentSubmissions := make(map[string][]domain.Submission)
	for _, submission := range submissions {
		studentID := submission.Student.ID
		studentSubmissions[studentID] = append(studentSubmissions[studentID], submission)
	}

	// Calculate performance for each student
	var studentPerformances []domain.StudentContestPerformance
	for studentID, subs := range studentSubmissions {
		// Get the best submission for this student
		bestSubmission := u.getBestSubmission(subs)

		student, exists := studentMap[studentID]
		if !exists {
			continue
		}

		// Apply filters
		if !u.matchesFilters(student, filters) {
			continue
		}

		performance := u.calculateStudentPerformance(bestSubmission, student, totalQuestions)
		studentPerformances = append(studentPerformances, performance)
	}

	// Calculate overall statistics
	stats := &domain.ContestStatistics{
		ContestID:         contest.ID,
		ContestTitle:      contest.Title,
		TotalParticipants: len(studentPerformances),
		TotalQuestions:    totalQuestions,
		GeneratedAt:       time.Now().Format(time.RFC3339),
	}

	// Calculate basic stats
	totalScore := 0.0
	passedCount := 0
	failedCount := 0

	for _, perf := range studentPerformances {
		totalScore += perf.Score
		if perf.Performance == "fail" {
			failedCount++
		} else {
			passedCount++
		}
	}

	stats.PassedCount = passedCount
	stats.FailedCount = failedCount
	stats.AverageScore = 0.0
	if stats.TotalParticipants > 0 {
		stats.AverageScore = totalScore / float64(stats.TotalParticipants)
		stats.PassRate = (float64(passedCount) / float64(stats.TotalParticipants)) * 100
	}

	// Calculate gender statistics
	stats.GenderStats = u.calculateGenderStats(studentPerformances)

	// Calculate city, school, and grade statistics
	stats.CityStats = u.calculateCategoryStats(studentPerformances, "city")
	stats.SchoolStats = u.calculateCategoryStats(studentPerformances, "school")
	stats.GradeStats = u.calculateCategoryStats(studentPerformances, "grade")

	// Calculate score distribution
	stats.ScoreDistribution = u.calculateScoreDistribution(studentPerformances)
	stats.PerformanceLevels = domain.PerformanceLevels{
		Excellent: stats.ScoreDistribution.Excellent,
		Good:      stats.ScoreDistribution.Good,
		Average:   stats.ScoreDistribution.Average,
		Fail:      stats.ScoreDistribution.Poor,
	}

	return stats
}

func (u *contestStatisticsUsecase) calculateStudentPerformances(
	submissions []domain.Submission,
	studentMap map[string]domain.Student,
	contest *domain.Contest,
	totalQuestions int,
	filters domain.StatisticsFilters,
) []domain.StudentContestPerformance {
	// Group submissions by student
	studentSubmissions := make(map[string][]domain.Submission)
	for _, submission := range submissions {
		studentID := submission.Student.ID
		studentSubmissions[studentID] = append(studentSubmissions[studentID], submission)
	}

	var performances []domain.StudentContestPerformance
	for studentID, subs := range studentSubmissions {
		// Get the best submission for this student
		bestSubmission := u.getBestSubmission(subs)

		student, exists := studentMap[studentID]
		if !exists {
			continue
		}

		// Apply filters
		if !u.matchesFilters(student, filters) {
			continue
		}

		performance := u.calculateStudentPerformance(bestSubmission, student, totalQuestions)
		performances = append(performances, performance)
	}

	// Sort by score (descending)
	sort.Slice(performances, func(i, j int) bool {
		return performances[i].Score > performances[j].Score
	})

	return performances
}

func (u *contestStatisticsUsecase) getBestSubmission(submissions []domain.Submission) domain.Submission {
	if len(submissions) == 1 {
		return submissions[0]
	}

	// Find the submission with the highest score
	best := submissions[0]
	for _, sub := range submissions[1:] {
		if sub.Score > best.Score {
			best = sub
		}
	}
	return best
}

func (u *contestStatisticsUsecase) calculateStudentPerformance(
	submission domain.Submission,
	student domain.Student,
	totalQuestions int,
) domain.StudentContestPerformance {
	correctAnswers := int(submission.Score)
	percentage := 0.0
	if totalQuestions > 0 {
		percentage = (float64(correctAnswers) / float64(totalQuestions)) * 100
	}

	performance := "fail"
	if percentage >= 90 {
		performance = "excellent"
	} else if percentage >= 70 {
		performance = "good"
	} else if percentage >= 50 {
		performance = "average"
	}

	return domain.StudentContestPerformance{
		StudentID:      student.ID,
		StudentName:    student.Name,
		StudentGender:  student.Gender,
		StudentCity:    student.City,
		StudentSchool:  student.School,
		StudentGrade:   student.Grade,
		Score:          submission.Score,
		TotalQuestions: totalQuestions,
		CorrectAnswers: correctAnswers,
		Percentage:     percentage,
		Performance:    performance,
		TimeSpent:      submission.TimeSpend,
		SubmissionTime: submission.SubmissionTime.Format(time.RFC3339),
	}
}

func (u *contestStatisticsUsecase) matchesFilters(student domain.Student, filters domain.StatisticsFilters) bool {
	if filters.Gender != "" && normalizeGender(student.Gender) != normalizeGender(filters.Gender) {
		return false
	}
	if filters.City != "" && student.City != filters.City {
		return false
	}
	if filters.School != "" && student.School != filters.School {
		return false
	}
	if filters.Grade != "" && student.Grade != filters.Grade {
		return false
	}
	return true
}

// calculateGenderStats buckets participants with the shared normalizeGender
// helper (admin_usecase.go, issue #5): the old inline comparison to "male"/
// "female" silently dropped "M"/"F"/other/unknown rows, so gender_stats could
// never sum to total_participants. All four buckets are now reported.
func (u *contestStatisticsUsecase) calculateGenderStats(performances []domain.StudentContestPerformance) domain.GenderStatistics {
	buckets := map[string]*domain.CategoryStats{
		genderMale:    {},
		genderFemale:  {},
		genderOther:   {},
		genderUnknown: {},
	}

	for _, perf := range performances {
		stats := buckets[normalizeGender(perf.StudentGender)]
		stats.Total++
		stats.AverageScore += perf.Score
		if perf.Performance != "fail" {
			stats.Passed++
		} else {
			stats.Failed++
		}
	}

	for _, stats := range buckets {
		if stats.Total > 0 {
			stats.PassRate = (float64(stats.Passed) / float64(stats.Total)) * 100
			stats.AverageScore = stats.AverageScore / float64(stats.Total)
		}
	}

	return domain.GenderStatistics{
		Male:    *buckets[genderMale],
		Female:  *buckets[genderFemale],
		Other:   *buckets[genderOther],
		Unknown: *buckets[genderUnknown],
	}
}

func (u *contestStatisticsUsecase) calculateCategoryStats(performances []domain.StudentContestPerformance, category string) map[string]domain.CategoryStats {
	stats := make(map[string]domain.CategoryStats)

	for _, perf := range performances {
		var value string
		switch category {
		case "city":
			value = perf.StudentCity
		case "school":
			value = perf.StudentSchool
		case "grade":
			value = perf.StudentGrade
		default:
			continue
		}

		if value == "" {
			continue
		}

		if _, exists := stats[value]; !exists {
			stats[value] = domain.CategoryStats{}
		}

		stat := stats[value]
		stat.Total++
		stat.AverageScore += perf.Score
		if perf.Performance != "fail" {
			stat.Passed++
		} else {
			stat.Failed++
		}
		stats[value] = stat
	}

	// Calculate pass rates and average scores
	for key, stat := range stats {
		if stat.Total > 0 {
			stat.PassRate = (float64(stat.Passed) / float64(stat.Total)) * 100
			stat.AverageScore = stat.AverageScore / float64(stat.Total)
			stats[key] = stat
		}
	}

	return stats
}

func (u *contestStatisticsUsecase) calculateScoreDistribution(performances []domain.StudentContestPerformance) domain.ScoreDistribution {
	distribution := domain.ScoreDistribution{}

	for _, perf := range performances {
		if perf.Percentage >= 90 {
			distribution.Excellent++
		} else if perf.Percentage >= 70 {
			distribution.Good++
		} else if perf.Percentage >= 50 {
			distribution.Average++
		} else {
			distribution.Poor++
		}
	}

	return distribution
}
