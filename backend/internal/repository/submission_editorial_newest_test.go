package repository

import (
	"testing"
	"time"

	"victor-contest-go/internal/domain"
)

// GetSubmissionsByStudentAndContest feeds the student editorial. The GSI is
// keyed (contest_id, student_id) with no time sort, so with multiple
// submissions Items[0] was an arbitrary row and the editorial could show a
// stale attempt. It must return the NEWEST submission.
func TestLocalDynamoEditorialPicksNewestSubmission(t *testing.T) {
	client := localDynamoClient(t)
	repo := &SubmissionDynamoRepository{db: client, tableName: "submissions"}

	suffix := itoa(time.Now().UnixNano())
	studentID := "it-editorial-" + suffix
	contestID := "it-editorial-contest-" + suffix

	base := time.Now().UTC().Add(-3 * time.Hour)
	type attempt struct {
		id    string
		score float64
		time  time.Time
	}
	attempts := []attempt{
		{"it-edit-oldest-" + suffix, 0, base},
		{"it-edit-newest-" + suffix, 7, base.Add(2 * time.Hour)},
		{"it-edit-middle-" + suffix, 3, base.Add(time.Hour)},
	}
	for _, a := range attempts {
		sub := domain.Submission{
			ID:             a.id,
			ContestID:      contestID,
			StudentID:      studentID,
			Score:          a.score,
			SubmissionTime: a.time,
		}
		sub.Student.ID = studentID
		if _, err := repo.AddSubmission(sub); err != nil {
			t.Fatalf("AddSubmission %s: %v", a.id, err)
		}
	}
	ids := make([]string, 0, len(attempts))
	for _, a := range attempts {
		ids = append(ids, a.id)
	}
	defer cleanupIDs(t, client, "submissions", ids...)

	got, err := repo.GetSubmissionsByStudentAndContest(contestID, studentID)
	if err != nil {
		t.Fatalf("GetSubmissionsByStudentAndContest: %v", err)
	}
	if got == nil {
		t.Fatal("GetSubmissionsByStudentAndContest returned nil, want newest submission")
	}
	if got.ID != "it-edit-newest-"+suffix {
		t.Errorf("got submission %s (score %v), want newest it-edit-newest-%s (score 7)", got.ID, got.Score, suffix)
	}

	// No submissions for this pair -> nil, nil (student did not participate).
	none, err := repo.GetSubmissionsByStudentAndContest(contestID, "nobody-"+suffix)
	if err != nil {
		t.Fatalf("GetSubmissionsByStudentAndContest(missing): %v", err)
	}
	if none != nil {
		t.Errorf("got %+v for unknown student, want nil", none)
	}
}
