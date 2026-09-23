package usecase

import (
	"errors"
	"sort"

	"victor-contest-go/internal/domain"
)

var ErrQuestionNotFound = errors.New("question not found")

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
	err := u.repo.AddMultipleQuestions(questions)
	return err
}
