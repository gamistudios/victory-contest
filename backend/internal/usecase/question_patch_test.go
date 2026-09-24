package usecase

import (
	"errors"
	"testing"

	"victory-contest-go/internal/domain"
)

type patchFakeRepo struct {
	stored *domain.Question
	saved  domain.Question
	putN   int
}

func (f *patchFakeRepo) AddQuestion(question domain.Question) (string, error) {
	return "", errors.New("unused")
}
func (f *patchFakeRepo) AddMultipleQuestions(questions []domain.Question) error {
	return errors.New("unused")
}
func (f *patchFakeRepo) UpdateQuestion(id string, update domain.Question) error {
	update.ID = id
	f.saved = update
	f.putN++
	return nil
}
func (f *patchFakeRepo) DeleteQuestion(id string) error { return errors.New("unused") }
func (f *patchFakeRepo) DeleteQuestions(ids []string) ([]string, map[string]string, error) {
	return nil, nil, errors.New("unused")
}
func (f *patchFakeRepo) GetQuestionByID(id string) (*domain.Question, error) {
	if f.stored == nil || f.stored.ID != id {
		return nil, nil
	}
	return f.stored, nil
}
func (f *patchFakeRepo) GetAllQuestions() ([]domain.Question, error) { return nil, nil }

func TestUpdateQuestion_PatchKeepsOmittedFields(t *testing.T) {
	repo := &patchFakeRepo{stored: &domain.Question{
		ID: "q1", QuestionText: "What is 3+4?", Answer: 3,
		Explanation: "seven", Subject: "Mathematics", Grade: "12",
		MultipleChoice: []string{"5", "6", "7", "8"},
	}}
	u := NewQuestionUsecase(repo)

	newAnswer := 2
	if err := u.UpdateQuestion("q1", domain.QuestionPatch{Answer: &newAnswer}); err != nil {
		t.Fatalf("UpdateQuestion: %v", err)
	}
	if repo.saved.QuestionText != "What is 3+4?" || repo.saved.Answer != 2 {
		t.Fatalf("stored row after patch = %+v", repo.saved)
	}
	if len(repo.saved.MultipleChoice) != 4 || repo.saved.Explanation != "seven" ||
		repo.saved.Subject != "Mathematics" || repo.saved.Grade != "12" {
		t.Fatalf("patch wiped omitted fields: %+v", repo.saved)
	}
}

func TestUpdateQuestion_ExplicitClearStillWorks(t *testing.T) {
	repo := &patchFakeRepo{stored: &domain.Question{ID: "q1", Explanation: "seven", Answer: 1}}
	u := NewQuestionUsecase(repo)

	empty := ""
	if err := u.UpdateQuestion("q1", domain.QuestionPatch{Explanation: &empty}); err != nil {
		t.Fatalf("UpdateQuestion: %v", err)
	}
	if repo.saved.Explanation != "" || repo.saved.Answer != 1 {
		t.Fatalf("saved = %+v", repo.saved)
	}
}

func TestUpdateQuestion_UnknownIDIs404NotPhantomRow(t *testing.T) {
	repo := &patchFakeRepo{}
	u := NewQuestionUsecase(repo)

	answer := 2
	if err := u.UpdateQuestion("missing", domain.QuestionPatch{Answer: &answer}); !errors.Is(err, ErrQuestionNotFound) {
		t.Fatalf("err = %v, want ErrQuestionNotFound", err)
	}
	if repo.putN != 0 {
		t.Fatal("nothing may be written for an unknown question id")
	}
}
