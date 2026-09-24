package usecase

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"victory-contest-go/internal/domain"
)

// ErrInvalidContest marks contest input the client must fix (README §9 #50:
// contest times were free-form strings). Handlers map it to HTTP 400.
var ErrInvalidContest = errors.New("invalid contest")

// ValidateContestTimes checks provided start/end times against the same
// layouts the dashboard parses with, and that the window is ordered.
// Empty values are allowed (create may omit start; PATCH leaves them unset).
func ValidateContestTimes(startTime, endTime string) error {
	st, sok := parseContestTime(startTime)
	et, eok := parseContestTime(endTime)
	if strings.TrimSpace(startTime) != "" && !sok {
		return fmt.Errorf("%w: 'start_time' %q is not a valid timestamp (use RFC3339, e.g. 2026-09-23T12:00:00Z)", ErrInvalidContest, startTime)
	}
	if strings.TrimSpace(endTime) != "" && !eok {
		return fmt.Errorf("%w: 'end_time' %q is not a valid timestamp (use RFC3339, e.g. 2026-09-23T14:00:00Z)", ErrInvalidContest, endTime)
	}
	if sok && eok && !et.After(st) {
		return fmt.Errorf("%w: 'end_time' must be after 'start_time'", ErrInvalidContest)
	}
	return nil
}

// ContestHasEnded reports whether a contest has provably finished: its
// end_time is set, parseable (same layouts as the dashboard, issue #38) and
// in the past. Anything else — unset, garbage or future — counts as LIVE, so
// answer-bearing payloads stay hidden until the contest has verifiably ended.
// Handlers use this to decide whether the student-facing views may include
// correct answers/explanations (README §9 #11).
func ContestHasEnded(endTime string) bool {
	t, ok := parseContestTime(endTime)
	return ok && t.Before(time.Now())
}

type ContestUsecase interface {
	GetAllContests() ([]domain.Contest, error)
	GetContestByID(id string) (*domain.ContestTypeWithQuestionObj, error)
	AddContest(contest domain.Contest) (string, error)
	UpdateContest(id string, update domain.Contest) error
	DeleteContest(id string) error
	CloneContest(id string, newTitle string, newDescription string) (string, error)
}

type contestUsecase struct {
	contestRepo  ContestRepository
	questionRepo QuestionRepository
}

func NewContestUsecase(repo ContestRepository, qRepo QuestionRepository) ContestUsecase {
	return &contestUsecase{contestRepo: repo, questionRepo: qRepo}
}

func (u *contestUsecase) GetAllContests() ([]domain.Contest, error) {
	return u.contestRepo.GetAllContests()
}
func (u *contestUsecase) GetContestByID(id string) (*domain.ContestTypeWithQuestionObj, error) {
	contest, err := u.contestRepo.GetContestByID(id)
	if err != nil || contest == nil {
		if contest == nil {
			return nil, nil
		}
		return nil, err
	}

	// Debug logging

	questions, err := u.questionRepo.GetAllQuestions()
	if err != nil {
		return nil, err
	}

	structuredQuestion := make(map[string]domain.Question)
	for _, q := range questions {
		structuredQuestion[q.ID] = q
	}

	qs := []domain.Question{}

	for _, questionID := range contest.Questions {
		if question, exists := structuredQuestion[questionID]; exists {
			qs = append(qs, question)
		}
	}

	resultContest := &domain.ContestTypeWithQuestionObj{}
	resultContest.Contest = *contest
	resultContest.Questions = qs

	return resultContest, nil
}
func (u *contestUsecase) AddContest(contest domain.Contest) (string, error) {
	if err := ValidateContestTimes(contest.StartTime, contest.EndTime); err != nil {
		return "", err
	}
	contest.ID = GenerateUniqueId()
	return u.contestRepo.AddContest(contest)
}
func (u *contestUsecase) UpdateContest(id string, update domain.Contest) error {
	return u.contestRepo.UpdateContest(id, update)
}
func (u *contestUsecase) DeleteContest(id string) error { return u.contestRepo.DeleteContest(id) }

func (u *contestUsecase) CloneContest(id string, newTitle string, newDescription string) (string, error) {
	// Get the original contest
	originalContest, err := u.contestRepo.GetContestByID(id)
	if err != nil {
		return "", fmt.Errorf("failed to get original contest: %w", err)
	}
	if originalContest == nil {
		return "", fmt.Errorf("original contest not found")
	}

	// Create a new contest with the same data but new title and description
	clonedContest := domain.Contest{
		Title:       newTitle,
		Description: newDescription,
		StartTime:   originalContest.StartTime,
		EndTime:     originalContest.EndTime,
		Subject:     originalContest.Subject,
		Grade:       originalContest.Grade,
		Prize:       originalContest.Prize,
		Status:      "draft", // Set to draft status for cloned contests
		Type:        originalContest.Type,
		Questions:   originalContest.Questions, // Clone the questions
	}

	// Add the cloned contest
	clonedContestID, err := u.contestRepo.AddContest(clonedContest)
	if err != nil {
		return "", fmt.Errorf("failed to add cloned contest: %w", err)
	}

	return clonedContestID, nil
}
