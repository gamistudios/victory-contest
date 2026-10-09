package usecase

import (
	"errors"
	"fmt"
	"sort"

	"victory-contest-go/internal/domain"
)

var ErrQuestionNotFound = errors.New("question not found")

// ErrInvalidQuestion marks client-side question validation failures
// (README §9 #50: answers were never range-checked against the options).
// Handlers map it to HTTP 400.
var ErrInvalidQuestion = errors.New("invalid question")

// validateQuestion enforces the wire convention the grader relies on: at
// least two options and a 1-based correct answer inside that range.
func validateQuestion(q domain.Question) error {
	if len(q.MultipleChoice) < 2 {
		return fmt.Errorf("%w: 'multiple_choice' needs at least 2 options", ErrInvalidQuestion)
	}
	if q.Answer < 1 || q.Answer > len(q.MultipleChoice) {
		return fmt.Errorf("%w: 'answer' must be between 1 and %d (1-based option index), got %d", ErrInvalidQuestion, len(q.MultipleChoice), q.Answer)
	}
	return nil
}

// ValidateQuestion is the exported form handlers use to reject bad input
// before spending an upload on it.
func ValidateQuestion(q domain.Question) error { return validateQuestion(q) }

// normalizeOptionImages returns a per-option image list exactly as long as
// optionCount: entries beyond optionCount are dropped, missing slots are
// padded with "". This keeps the list aligned with MultipleChoice so a
// desync (stale extra image, or options added without images) can never
// leave the student UI with an image for a non-existent option.
func normalizeOptionImages(images []string, optionCount int) []string {
	out := make([]string, optionCount)
	for i := 0; i < optionCount; i++ {
		if i < len(images) {
			out[i] = images[i]
		}
	}
	return out
}

type QuestionUsecase interface {
	AddQuestion(question domain.Question) (string, error)
	UpdateQuestion(id string, patch domain.QuestionPatch) error
	DeleteQuestion(id string) error
	DeleteQuestions(ids []string) (*BulkDeleteResult, error)
	GetQuestionByID(id string) (*domain.Question, error)
	GetAllQuestions() ([]domain.Question, error)
	AddMultipleQuestions(questions []domain.Question) error
}

// BulkDeleteFailure reports one id that could not be deleted and why.
type BulkDeleteFailure struct {
	ID    string `json:"id"`
	Error string `json:"error"`
}

// BulkDeleteResult is the outcome of a bulk delete: ids removed and per-id failures.
type BulkDeleteResult struct {
	Deleted []string            `json:"deleted"`
	Failed  []BulkDeleteFailure `json:"failed"`
}

type questionUsecase struct {
	repo QuestionRepository
}

func NewQuestionUsecase(repo QuestionRepository) QuestionUsecase {
	return &questionUsecase{repo: repo}
}

func (u *questionUsecase) AddQuestion(question domain.Question) (string, error) {
	if err := validateQuestion(question); err != nil {
		return "", err
	}
	// Keep the per-option image list aligned to the option count so a
	// hand-built request can't desync options and their images.
	question.OptionImages = normalizeOptionImages(question.OptionImages, len(question.MultipleChoice))
	question.ID = GenerateUniqueId()
	return u.repo.AddQuestion(question)
}
func (u *questionUsecase) UpdateQuestion(id string, patch domain.QuestionPatch) error {
	// Read-merge-write: PATCH must only touch the fields the client actually
	// sent. The repository does a full PutItem, so writing the bound struct
	// verbatim used to wipe every omitted field.
	existing, err := u.repo.GetQuestionByID(id)
	if err != nil {
		return err
	}
	if existing == nil {
		return ErrQuestionNotFound
	}
	updated := *existing
	if patch.QuestionText != nil {
		updated.QuestionText = *patch.QuestionText
	}
	if patch.Answer != nil {
		updated.Answer = *patch.Answer
	}
	if patch.QuestionImg != nil {
		updated.QuestionImg = *patch.QuestionImg
	}
	if patch.Explanation != nil {
		updated.Explanation = *patch.Explanation
	}
	if patch.ExplanationImg != nil {
		updated.ExplanationImg = *patch.ExplanationImg
	}
	if patch.Subject != nil {
		updated.Subject = *patch.Subject
	}
	if patch.Grade != nil {
		updated.Grade = *patch.Grade
	}
	if patch.Chapter != nil {
		updated.Chapter = *patch.Chapter
	}
	if patch.MultipleChoice != nil {
		updated.MultipleChoice = *patch.MultipleChoice
	}
	if patch.OptionImages != nil {
		// Option images align index-by-index with the options; normalize so a
		// stale or over-long list can never desync from the option count.
		updated.OptionImages = normalizeOptionImages(*patch.OptionImages, len(updated.MultipleChoice))
	}
	// Only patches that touch the answer/options need the range check —
	// legacy rows without options stay editable (e.g. to fix the text) so
	// this validation cannot lock them out (README §9 #50).
	if patch.Answer != nil || patch.MultipleChoice != nil {
		if err := validateQuestion(updated); err != nil {
			return err
		}
	}
	return u.repo.UpdateQuestion(id, updated)
}
func (u *questionUsecase) DeleteQuestion(id string) error {
	return u.repo.DeleteQuestion(id)
}

// DeleteQuestions bulk-deletes the given ids and reports per-id failures.
func (u *questionUsecase) DeleteQuestions(ids []string) (*BulkDeleteResult, error) {
	deleted, failedMap, err := u.repo.DeleteQuestions(ids)
	if err != nil {
		return nil, err
	}

	failures := make([]BulkDeleteFailure, 0, len(failedMap))
	for id, msg := range failedMap {
		failures = append(failures, BulkDeleteFailure{ID: id, Error: msg})
	}
	// Deterministic order for the failed list.
	sort.Slice(failures, func(i, j int) bool { return failures[i].ID < failures[j].ID })

	if deleted == nil {
		deleted = []string{}
	}
	return &BulkDeleteResult{Deleted: deleted, Failed: failures}, nil
}
func (u *questionUsecase) GetQuestionByID(id string) (*domain.Question, error) {
	return u.repo.GetQuestionByID(id)
}
func (u *questionUsecase) GetAllQuestions() ([]domain.Question, error) {
	return u.repo.GetAllQuestions()
}

func (u *questionUsecase) AddMultipleQuestions(questions []domain.Question) error {
	for i, q := range questions {
		if err := validateQuestion(q); err != nil {
			return fmt.Errorf("question %d: %w", i+1, err)
		}
	}
	err := u.repo.AddMultipleQuestions(questions)
	return err
}
