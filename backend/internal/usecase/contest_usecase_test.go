package usecase

import (
	"reflect"
	"testing"

	"victory-contest-go/internal/domain"
)

// archivedContestRepo returns a contest whose questions were linked but then
// removed from the question table.
type archivedContestRepo struct {
	contest *domain.Contest
}

func (f *archivedContestRepo) GetAllContests() ([]domain.Contest, error) {
	if f.contest == nil {
		return nil, nil
	}
	return []domain.Contest{*f.contest}, nil
}
func (f *archivedContestRepo) GetContestByID(id string) (*domain.Contest, error) { return f.contest, nil }
func (f *archivedContestRepo) AddContest(c domain.Contest) (string, error)       { return c.ID, nil }
func (f *archivedContestRepo) UpdateContest(id string, u domain.Contest) error   { return nil }
func (f *archivedContestRepo) DeleteContest(id string) error                     { return nil }

// archivedQuestionRepo models the 33 past rounds: the question docs are gone,
// so the batch read comes back empty.
type archivedQuestionRepo struct{}

func (f *archivedQuestionRepo) GetByIDs(ids []string) ([]domain.Question, error) { return nil, nil }
func (f *archivedQuestionRepo) GetAllQuestions() ([]domain.Question, error)      { return nil, nil }
func (f *archivedQuestionRepo) AddQuestion(q domain.Question) (string, error)   { return q.ID, nil }
func (f *archivedQuestionRepo) AddMultipleQuestions(qs []domain.Question) error { return nil }
func (f *archivedQuestionRepo) UpdateQuestion(id string, u domain.Question) error {
	return nil
}
func (f *archivedQuestionRepo) DeleteQuestion(id string) error { return nil }
func (f *archivedQuestionRepo) DeleteQuestions(ids []string) ([]string, map[string]string, error) {
	return ids, nil, nil
}
func (f *archivedQuestionRepo) GetQuestionByID(id string) (*domain.Question, error) {
	return nil, nil
}

func TestGetContestByIDKeepsQuestionIDsWhenQuestionsAreArchived(t *testing.T) {
	u := NewContestUsecase(
		&archivedContestRepo{contest: &domain.Contest{
			ID: "c1", Questions: []string{"q1", "q2", "q3"},
		}},
		&archivedQuestionRepo{},
	)
	got, err := u.GetContestByID("c1")
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Questions) != 0 {
		t.Fatalf("hydrated questions should be empty once archived, got %d", len(got.Questions))
	}
	if !reflect.DeepEqual(got.QuestionIDs, []string{"q1", "q2", "q3"}) {
		t.Fatalf("QuestionIDs must keep the raw stored list, got %v", got.QuestionIDs)
	}
}
