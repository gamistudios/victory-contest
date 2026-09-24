package usecase

import (
	"errors"
	"fmt"
	"log"
	"sort"
	"time"
	"victor-contest-go/internal/domain"
)

// ErrStudentAlreadyExists is returned by AddStudent when a student row with
// the same telegram_id already exists (issue #31: unconditional PutItem let the
// same Telegram user register twice). Handlers should map it to HTTP 409.
var ErrStudentAlreadyExists = errors.New("student with this telegram_id already exists")

// ErrStudentNotFound is returned by GetQuickStat when no student row has the
// given id. Handlers map it to HTTP 404 instead of answering 200 with a null
// stat (README §9 #48: quickstat used to fabricate placeholder data).
var ErrStudentNotFound = errors.New("student not found")

// StudentUsecase defines the business logic for students
type StudentUsecase interface {
	AddStudent(student domain.Student) error
	UpdateStudent(student domain.Student) error
	DeleteStudent(id string) error
	VerifyStudentPaid(telegramID string) (bool, error)
	GetPaidStudents() ([]domain.Student, error)
	GetStudents() ([]domain.Student, error)
	GetStudentByID(id string) (*domain.Student, error)
	GetStudentByTelegramID(telegramID string) (*domain.Student, error)
	GetQuickStat(studentID string) (map[string]interface{}, error)
	GetStudentRankings() ([]map[string]interface{}, error)
	GetStudentRankingsByContest(contestID string) ([]map[string]interface{}, error)
	GetGradesAndSchools() (map[string][]string, error)
	GetUserProfile(studentID string) (map[string]interface{}, error)
	GetUserStatForAdmin(studId string) (*domain.StudentProfileAdminResponse, error)
}

type studentUsecase struct {
	repo           StudentRepository
	paymentRepo    PaymentRepository
	submissionRepo SubmissionRepository
	contestRepo    ContestRepository
}

func NewStudentUsecase(repo StudentRepository, paymentRepo PaymentRepository, submissionRepo SubmissionRepository, contestRepo ContestRepository) StudentUsecase {
	return &studentUsecase{repo: repo, paymentRepo: paymentRepo, submissionRepo: submissionRepo, contestRepo: contestRepo}
}

func (u *studentUsecase) AddStudent(student domain.Student) error {
	student.CreatedAt = time.Now().In(time.Local)
	return u.repo.AddStudent(student)
}
func (u *studentUsecase) UpdateStudent(student domain.Student) error {
	return u.repo.UpdateStudent(student)
}

func (u *studentUsecase) DeleteStudent(id string) error {
	return u.repo.DeleteStudent(id)
}

func (u *studentUsecase) VerifyStudentPaid(telegramID string) (bool, error) {
	return u.repo.VerifyStudentPaid(telegramID)
}
func (u *studentUsecase) GetPaidStudents() ([]domain.Student, error) {
	return u.repo.GetPaidStudents()
}
func (u *studentUsecase) GetStudents() ([]domain.Student, error) {
	return u.repo.GetStudents()
}
func (u *studentUsecase) GetStudentByID(id string) (*domain.Student, error) {
	student, err := u.repo.GetStudentByID(id)
	if err != nil {
		return nil, err
	}
	if student == nil {
		return nil, nil
	}
	u.enrichStudent(student)
	return student, nil
}

func (u *studentUsecase) GetStudentByTelegramID(telegramID string) (*domain.Student, error) {
	student, err := u.repo.GetStudentByTelegramID(telegramID)
	if err != nil {
		return nil, err
	}
	if student == nil {
		return nil, nil
	}
	u.enrichStudent(student)
	return student, nil
}

// enrichStudent derives IsPremium from the student's payment rows: an Approved
// payment whose (UTC-stored) expiration date is still in the future. A payment
// lookup failure is logged and treated as "no payments" rather than failing the
// student lookup — DELETE /api/student/:id and profile reads need the student
// row to exist even when the payment table misbehaves (client issue #1).
func (u *studentUsecase) enrichStudent(student *domain.Student) {
	if student.ReadNotifications == nil {
		student.ReadNotifications = make(map[string]domain.ReadNotificationModel)
	}
	student.IsPremium = false

	payments, err := u.paymentRepo.ListByUser(student.ID)
	if err != nil {
		log.Printf("payments: ListByUser(%s) failed, treating as no payments: %v", student.ID, err)
		return
	}
	now := time.Now().UTC()
	for _, pay := range payments {
		if pay.Status == "Approved" && pay.ExpirationDate.After(now) {
			student.IsPremium = true
			break
		}
	}
}

// GetQuickStat aggregates a student's real stats from the submission, contest
// and payment tables (README §9 #48: the repository stub returned hardcoded
// zeros/nulls). totalPoints is the sum of the server-graded official scores,
// contestSubmissions are the student's submissions with their contests
// attached, and payment is the most recently created Approved payment or nil.
// Unknown ids now fail with ErrStudentNotFound (mapped to 404) instead of a
// silent 200 with a null stat.
func (u *studentUsecase) GetQuickStat(studentID string) (map[string]interface{}, error) {
	student, err := u.repo.GetStudentByID(studentID)
	if err != nil {
		return nil, err
	}
	if student == nil {
		return nil, fmt.Errorf("%w: %s", ErrStudentNotFound, studentID)
	}

	subs, err := u.submissionRepo.GetSubmissionsByStudent(studentID)
	if err != nil {
		return nil, err
	}
	contests, err := u.contestRepo.GetAllContests()
	if err != nil {
		return nil, err
	}
	structuredContests := make(map[string]domain.Contest, len(contests))
	for _, c := range contests {
		structuredContests[c.ID] = c
	}
	contestSubmissions := make([]domain.Submission, 0, len(subs))
	contestsCompleted := make(map[string]struct{}, len(subs))
	for _, sub := range subs {
		if c, ok := structuredContests[sub.ContestID]; ok {
			sub.Contest = c
		}
		contestsCompleted[sub.ContestID] = struct{}{}
		contestSubmissions = append(contestSubmissions, sub)
	}

	payments, err := u.paymentRepo.ListByUser(studentID)
	if err != nil && err.Error() != "payments not found" {
		return nil, err
	}
	var payment *domain.PaymentRequest
	for i, p := range payments {
		if p.Status != domain.StatusApproved {
			continue
		}
		if payment == nil || p.CreatedAt.After(payment.CreatedAt) {
			payment = &payments[i]
		}
	}

	// paymentOut is typed interface{} so "no approved payment" stores an
	// untyped nil; putting a nil *domain.PaymentRequest directly in the map
	// would make the value non-nil at every downstream interface check.
	var paymentOut interface{}
	if payment != nil {
		paymentOut = payment
	}

	return map[string]interface{}{
		"student_id":         student.ID,
		"telegram_id":        student.TelegramID,
		"name":               student.Name,
		"totalPoints":        CalculatePoints(subs),
		"contestsCompleted":  len(contestsCompleted),
		"payment":            paymentOut,
		"contestSubmissions": contestSubmissions,
	}, nil
}

// studentScoreAgg accumulates one student's official scores across the
// submissions fed to aggregateScoresForRanking.
type studentScoreAgg struct {
	studentID   string
	name        string
	imgURL      string
	totalScore  float64            // sum of official scores
	bestScore   float64            // highest single-submission score
	perContest  map[string]float64 // contest id -> best score in that contest
	submissions int
}

// aggregateScoresForRanking groups submissions by student. Display identity
// (name/imgurl) comes from the denormalized student snapshot on the newest
// submission that carries a non-empty value, matching what the existing
// leaderboard renders. The StudentID column is preferred over the embedded
// snapshot id so aggregation still works on rows with a partially written
// student attribute.
func aggregateScoresForRanking(subs []domain.Submission) map[string]*studentScoreAgg {
	latest := make(map[string]time.Time, len(subs))
	aggs := make(map[string]*studentScoreAgg, len(subs))
	for _, sub := range subs {
		id := sub.StudentID
		if id == "" {
			id = sub.Student.ID
		}
		if id == "" {
			continue // nothing to attribute the score to
		}
		agg, ok := aggs[id]
		if !ok {
			agg = &studentScoreAgg{studentID: id, perContest: map[string]float64{}}
			aggs[id] = agg
		}
		agg.totalScore += sub.Score
		agg.submissions++
		if sub.Score > agg.bestScore {
			agg.bestScore = sub.Score
		}
		if sub.Score > agg.perContest[sub.ContestID] {
			agg.perContest[sub.ContestID] = sub.Score
		}
		if !sub.SubmissionTime.Before(latest[id]) {
			latest[id] = sub.SubmissionTime
			if sub.Student.Name != "" {
				agg.name = sub.Student.Name
			}
			if sub.Student.ImgURL != "" {
				agg.imgURL = sub.Student.ImgURL
			}
		}
	}
	return aggs
}

// assignCompetitionRanks sorts entries by descending score and applies
// standard competition ranking: equal scores share a rank and the next
// distinct score skips ahead (1, 2, 2, 4). Ties are ordered deterministically
// by student id. getScore/setRank operate on the caller's concrete entry type.
func assignCompetitionRanks[T any](entries []T, getScore func(T) float64, getID func(T) string, setRank func(T, int)) {
	sort.Slice(entries, func(i, j int) bool {
		si, sj := getScore(entries[i]), getScore(entries[j])
		if si != sj {
			return si > sj
		}
		return getID(entries[i]) < getID(entries[j])
	})
	rank := 0
	var prevScore float64
	for i, e := range entries {
		s := getScore(e)
		if i == 0 || s != prevScore {
			rank = i + 1
			prevScore = s
		}
		setRank(e, rank)
	}
}

// GetStudentRankings builds the all-time student ranking board from real
// submission scores (README §9 #48: the repository stub returned nil). Only
// students with at least one submission appear; total_points is the sum of
// their server-graded scores, best_score the strongest single submission, and
// equal totals share a rank.
func (u *studentUsecase) GetStudentRankings() ([]map[string]interface{}, error) {
	subs, err := u.submissionRepo.GetAllSubmissions()
	if err != nil {
		return nil, err
	}
	aggs := aggregateScoresForRanking(subs)

	type ranked struct {
		entry map[string]interface{}
		score float64
		id    string
	}
	list := make([]ranked, 0, len(aggs))
	for _, a := range aggs {
		list = append(list, ranked{
			id:    a.studentID,
			score: a.totalScore,
			entry: map[string]interface{}{
				"student_id":       a.studentID,
				"name":             a.name,
				"imgurl":           a.imgURL,
				"total_points":     a.totalScore,
				"best_score":       a.bestScore,
				"contests_entered": len(a.perContest),
				"submissions":      a.submissions,
			},
		})
	}
	assignCompetitionRanks(list,
		func(r ranked) float64 { return r.score },
		func(r ranked) string { return r.id },
		func(r ranked, rank int) { r.entry["rank"] = rank },
	)
	rankings := make([]map[string]interface{}, 0, len(list))
	for _, r := range list {
		rankings = append(rankings, r.entry)
	}
	return rankings, nil
}

// GetStudentRankingsByContest ranks students within a single contest by their
// best official score there (a second submission must not double-count). Equal
// scores share a rank. An unknown contest is an error (404 at the handler),
// not an empty 200, so clients can tell the two apart.
func (u *studentUsecase) GetStudentRankingsByContest(contestID string) ([]map[string]interface{}, error) {
	contest, err := u.contestRepo.GetContestByID(contestID)
	if err != nil {
		return nil, err
	}
	if contest == nil {
		return nil, fmt.Errorf("%w: %s", ErrContestNotFound, contestID)
	}
	subs, err := u.submissionRepo.GetSubmissionsByContest(contestID)
	if err != nil {
		return nil, err
	}
	// Aggregate per student: bestScore is their strongest submission in this
	// contest (multiple submissions must not double-count toward the rank).
	aggs := aggregateScoresForRanking(subs)

	type ranked struct {
		entry map[string]interface{}
		score float64
		id    string
	}
	list := make([]ranked, 0, len(aggs))
	for _, a := range aggs {
		list = append(list, ranked{
			id:    a.studentID,
			score: a.bestScore,
			entry: map[string]interface{}{
				"contest_id":  contestID,
				"student_id":  a.studentID,
				"name":        a.name,
				"imgurl":      a.imgURL,
				"score":       a.bestScore,
				"submissions": a.submissions,
			},
		})
	}
	assignCompetitionRanks(list,
		func(r ranked) float64 { return r.score },
		func(r ranked) string { return r.id },
		func(r ranked, rank int) { r.entry["rank"] = rank },
	)
	rankings := make([]map[string]interface{}, 0, len(list))
	for _, r := range list {
		rankings = append(rankings, r.entry)
	}
	return rankings, nil
}
func (u *studentUsecase) GetGradesAndSchools() (map[string][]string, error) {
	return u.repo.GetGradesAndSchools()
}
func (u *studentUsecase) GetUserProfile(studentID string) (map[string]interface{}, error) {
	return u.repo.GetUserProfile(studentID)
}

func (r *studentUsecase) GetUserStatForAdmin(studId string) (*domain.StudentProfileAdminResponse, error) {
	student, err := r.repo.GetStudentByID(studId)
	if err != nil {
		return nil, err
	}
	if student == nil {
		return nil, errors.New("no student found with the provided ID")
	}

	userSubmissions, err := r.submissionRepo.GetSubmissionsByStudent(studId)
	if err != nil {
		return nil, err
	}
	totalPoints := CalculatePoints(userSubmissions)

	payments, err := r.paymentRepo.ListByUser(studId)
	if err != nil && err.Error() != "payments not found" {
		return nil, err
	}
	sort.Slice(payments, func(i, j int) bool {
		return payments[i].CreatedAt.After(payments[j].CreatedAt)
	})
	var payment domain.PaymentRequest
	if len(payments) > 0 {
		payment = payments[len(payments)-1]
	}
	contests, err := r.contestRepo.GetAllContests()
	if err != nil {
		return nil, err
	}
	structuredContests := make(map[string]domain.Contest)
	for _, contest := range contests {
		structuredContests[contest.ID] = contest
	}

	contestSubmissions := make([]domain.Submission, 0, len(userSubmissions))
	for _, sub := range userSubmissions {
		sub.Contest = structuredContests[sub.ContestID]
		contestSubmissions = append(contestSubmissions, sub)
	}

	result := &domain.StudentProfileAdminResponse{
		Student:            *student,
		TotalPoints:        totalPoints,
		Payment:            payment,
		ContestSubmissions: contestSubmissions,
	}

	return result, nil
}

func CalculatePoints(submissions []domain.Submission) int64 {
	var totalPoints int64
	for _, sub := range submissions {
		totalPoints += int64(sub.Score)
	}
	return totalPoints
}
