package usecase

import (
	"testing"

	"victory-contest-go/internal/domain"
)

// recordingSubmissionRepo captures the id GetSubmissionByID is called with.
type recordingSubmissionRepo struct {
	stubSubmissionRepo
	gotID string
	sub   *domain.Submission
}

func (r *recordingSubmissionRepo) GetSubmissionByID(id string) (*domain.Submission, error) {
	r.gotID = id
	return r.sub, nil
}

// #48: GetSubmissionByID must not special-case id=="leaderboard" anymore; the
// /submission/leaderboard URL is served by its own static route in the handler,
// so the usecase just delegates to the repository for any id.
func TestGetSubmissionByID_NoLeaderboardSpecialCase(t *testing.T) {
	repo := &recordingSubmissionRepo{sub: &domain.Submission{ID: "leaderboard"}}
	u := newUsecaseWithRepo(repo)

	got, err := u.GetSubmissionByID("leaderboard")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.gotID != "leaderboard" {
		t.Fatalf("repo.GetSubmissionByID called with %q, want delegation of the raw id", repo.gotID)
	}
	if got == nil || got.ID != "leaderboard" {
		t.Fatalf("expected repo result passthrough, got %+v", got)
	}
}

// #40: Submission used to implement error with a panicking Error() method.
// It must no longer satisfy the error interface (and cannot panic on print).
func TestSubmissionDoesNotImplementError(t *testing.T) {
	var v any = domain.Submission{}
	if _, ok := v.(error); ok {
		t.Fatal("domain.Submission still implements the error interface")
	}
}
