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

// normalizeOptionImages keeps the per-option image list aligned to the option
// count: extras are dropped, missing slots become "".
func TestNormalizeOptionImages(t *testing.T) {
	cases := []struct {
		images []string
		count  int
		want   []string
	}{
		{[]string{"a", "b"}, 4, []string{"a", "b", "", ""}},
		{[]string{"a", "b", "c", "d", "e"}, 4, []string{"a", "b", "c", "d"}},
		{nil, 3, []string{"", "", ""}},
		{[]string{"x"}, 1, []string{"x"}},
	}
	for _, c := range cases {
		got := normalizeOptionImages(c.images, c.count)
		if len(got) != len(c.want) {
			t.Fatalf("normalizeOptionImages(%v, %d) len = %d, want %d", c.images, c.count, len(got), len(c.want))
		}
		for i := range c.want {
			if got[i] != c.want[i] {
				t.Fatalf("normalizeOptionImages(%v, %d)[%d] = %q, want %q", c.images, c.count, i, got[i], c.want[i])
			}
		}
	}
}

// The add path and the merge path both funnel through normalizeOptionImages,
// which the unit test above pins: extras dropped, missing slots padded.

// Update path: a patch that replaces options AND option images keeps them
// aligned to the new option count.
func TestUpdateQuestion_OptionImagesAlignToOptions(t *testing.T) {
	repo := &patchFakeRepo{stored: &domain.Question{
		ID:             "q1",
		QuestionText:   "Q",
		Answer:         1,
		MultipleChoice: []string{"1", "2"},
		OptionImages:   []string{"http://old1", "http://old2"},
	}}
	u := NewQuestionUsecase(repo)

	newOptions := []string{"A", "B", "C", "D"}
	newImages := []string{"http://i1"} // only the first slot has a new image
	if err := u.UpdateQuestion("q1", domain.QuestionPatch{
		MultipleChoice: &newOptions,
		OptionImages:   &newImages,
	}); err != nil {
		t.Fatalf("UpdateQuestion: %v", err)
	}
	got := repo.saved.OptionImages
	if len(got) != 4 || got[0] != "http://i1" || got[1] != "" || got[2] != "" || got[3] != "" {
		t.Fatalf("option images not aligned to 4 options: %v", got)
	}
}

// Update path: an omitted option-images patch field keeps the stored images.
func TestUpdateQuestion_OmittedOptionImagesPreserved(t *testing.T) {
	repo := &patchFakeRepo{stored: &domain.Question{
		ID:             "q1",
		QuestionText:   "Q",
		Answer:         1,
		MultipleChoice: []string{"1", "2"},
		OptionImages:   []string{"http://old1", "http://old2"},
	}}
	u := NewQuestionUsecase(repo)

	text := "New text"
	if err := u.UpdateQuestion("q1", domain.QuestionPatch{QuestionText: &text}); err != nil {
		t.Fatalf("UpdateQuestion: %v", err)
	}
	if len(repo.saved.OptionImages) != 2 || repo.saved.OptionImages[0] != "http://old1" {
		t.Fatalf("omitted patch wiped stored option images: %v", repo.saved.OptionImages)
	}
}
