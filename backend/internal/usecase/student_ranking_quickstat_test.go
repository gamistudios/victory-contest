package usecase

import (
	"errors"
	"testing"
	"time"
	"victor-contest-go/internal/domain"
)

// Fakes for the README §9 #48 aggregation work: the student usecase now
// builds rankings and quick stats from the submission/contest/payment
// repositories instead of the repository-layer stubs that returned nil or
// hardcoded placeholders. Names are prefixed with "rank" to avoid clashing
// with the stubs in submission_leaderboard_test.go / student_usecase_test.go.

type rankStubSubmissionRepo struct {
	SubmissionRepository
	subs         []domain.Submission
	byContestErr error
}

func rankStudentSub(id, name string) domain.StudentSub {
	return domain.StudentSub{ID: id, Name: name, ImgURL: "https://img/" + id}
}

func rankSub(id, contestID, studentID, studentName string, score float64, at time.Time) domain.Submission {
	return domain.Submission{
		ID:             id,
		ContestID:      contestID,
		StudentID:      studentID,
		Student:        rankStudentSub(studentID, studentName),
		Score:          score,
		SubmissionTime: at,
		TimeSpend:      "00:10:00",
	}
}

func (r *rankStubSubmissionRepo) GetAllSubmissions() ([]domain.Submission, error) {
	return r.subs, nil
}

func (r *rankStubSubmissionRepo) GetSubmissionsByContest(contestID string) ([]domain.Submission, error) {
	if r.byContestErr != nil {
		return nil, r.byContestErr
	}
	out := make([]domain.Submission, 0)
	for _, s := range r.subs {
		if s.ContestID == contestID {
			out = append(out, s)
		}
	}
	return out, nil
}

func (r *rankStubSubmissionRepo) GetSubmissionsByStudent(studentID string) ([]domain.Submission, error) {
	out := make([]domain.Submission, 0)
	for _, s := range r.subs {
		if s.StudentID == studentID {
			out = append(out, s)
		}
	}
	return out, nil
}

type rankStubContestRepo struct {
	ContestRepository
	contests map[string]domain.Contest
}

func (c *rankStubContestRepo) GetContestByID(id string) (*domain.Contest, error) {
	if ct, ok := c.contests[id]; ok {
		return &ct, nil
	}
	return nil, nil
}

func (c *rankStubContestRepo) GetAllContests() ([]domain.Contest, error) {
	out := make([]domain.Contest, 0, len(c.contests))
	for _, ct := range c.contests {
		out = append(out, ct)
	}
	return out, nil
}

func rankTime(offset time.Duration) time.Time { return time.Now().UTC().Add(offset) }

func TestGetStudentRankings_SumsScoresAndTiesShareRank(t *testing.T) {
	subs := []domain.Submission{
		rankSub("s-1", "c1", "st-1", "Ada", 10, rankTime(-3*time.Hour)),
		rankSub("s-2", "c2", "st-1", "Ada", 20, rankTime(-2*time.Hour)),
		rankSub("s-3", "c1", "st-2", "Bob", 30, rankTime(-time.Hour)),
		rankSub("s-4", "c1", "st-3", "Cy", 10, rankTime(0)),
	}
	uc := NewStudentUsecase(&stubStudentRepo{}, &stubPaymentRepo{},
		&rankStubSubmissionRepo{subs: subs}, &rankStubContestRepo{})

	rankings, err := uc.GetStudentRankings()
	if err != nil {
		t.Fatalf("GetStudentRankings: %v", err)
	}
	if len(rankings) != 3 {
		t.Fatalf("expected 3 ranked students, got %d: %+v", len(rankings), rankings)
	}
	// st-1 (10+20=30) and st-2 (30) tie on total_points and share rank 1;
	// st-3 (10) gets competition rank 3 (the "2" slot is skipped).
	want := []struct {
		id    string
		rank  int64
		total float64
		best  float64
		conts int64
	}{
		{"st-1", 1, 30, 20, 2},
		{"st-2", 1, 30, 30, 1},
		{"st-3", 3, 10, 10, 1},
	}
	for i, w := range want {
		e := rankings[i]
		if e["student_id"] != w.id {
			t.Fatalf("entry %d: student_id=%v, want %s", i, e["student_id"], w.id)
		}
		if got := toInt64(t, e["rank"]); got != w.rank {
			t.Fatalf("entry %d (%s): rank=%v, want %d", i, w.id, got, w.rank)
		}
		if got := toFloat64(t, e["total_points"]); got != w.total {
			t.Fatalf("entry %d (%s): total_points=%v, want %v", i, w.id, got, w.total)
		}
		if got := toFloat64(t, e["best_score"]); got != w.best {
			t.Fatalf("entry %d (%s): best_score=%v, want %v", i, w.id, got, w.best)
		}
		if got := toInt64(t, e["contests_entered"]); got != w.conts {
			t.Fatalf("entry %d (%s): contests_entered=%v, want %d", i, w.id, got, w.conts)
		}
	}
}

func TestGetStudentRankings_EmptyDataIsEmptyListNotError(t *testing.T) {
	uc := NewStudentUsecase(&stubStudentRepo{}, &stubPaymentRepo{},
		&rankStubSubmissionRepo{}, &rankStubContestRepo{})
	rankings, err := uc.GetStudentRankings()
	if err != nil {
		t.Fatalf("expected no error for empty submissions, got %v", err)
	}
	if rankings == nil {
		t.Fatal("rankings must serialize as [] not null")
	}
	if len(rankings) != 0 {
		t.Fatalf("expected 0 entries, got %d", len(rankings))
	}
}

func TestGetStudentRankingsByContest_BestScorePerStudentTiesShareRank(t *testing.T) {
	subs := []domain.Submission{
		// st-1 submits twice to c1: 10 then 18 -> best 18, 2 submissions.
		rankSub("s-1", "c1", "st-1", "Ada", 10, rankTime(-2*time.Hour)),
		rankSub("s-2", "c1", "st-1", "Ada", 18, rankTime(-time.Hour)),
		rankSub("s-3", "c1", "st-2", "Bob", 18, rankTime(0)),
		// st-3 only entered c2 and must not leak into the c1 board.
		rankSub("s-4", "c2", "st-3", "Cy", 50, rankTime(0)),
	}
	contests := map[string]domain.Contest{"c1": {ID: "c1"}, "c2": {ID: "c2"}}
	uc := NewStudentUsecase(&stubStudentRepo{}, &stubPaymentRepo{},
		&rankStubSubmissionRepo{subs: subs}, &rankStubContestRepo{contests: contests})

	rankings, err := uc.GetStudentRankingsByContest("c1")
	if err != nil {
		t.Fatalf("GetStudentRankingsByContest: %v", err)
	}
	if len(rankings) != 2 {
		t.Fatalf("expected 2 ranked students in c1, got %d: %+v", len(rankings), rankings)
	}
	// st-1 and st-2 both best-score 18 in c1 -> shared rank 1, and st-1's
	// total (28) must NOT count, only its best (18).
	if rankings[0]["student_id"] != "st-1" && rankings[0]["student_id"] != "st-2" {
		t.Fatalf("unexpected top entry: %+v", rankings[0])
	}
	for _, e := range rankings {
		if got := toInt64(t, e["rank"]); got != 1 {
			t.Fatalf("tied entry %v: rank=%v, want 1", e["student_id"], got)
		}
		if got := toFloat64(t, e["score"]); got != 18 {
			t.Fatalf("entry %v: score=%v, want 18", e["student_id"], got)
		}
	}
	if got := toInt64(t, rankings[0]["submissions"]); got != 1 && got != 2 {
		t.Fatalf("submissions=%v, want 1 or 2", got)
	}
}

func TestGetStudentRankingsByContest_UnknownContestIsNotFound(t *testing.T) {
	uc := NewStudentUsecase(&stubStudentRepo{}, &stubPaymentRepo{},
		&rankStubSubmissionRepo{}, &rankStubContestRepo{})
	_, err := uc.GetStudentRankingsByContest("missing")
	if !errors.Is(err, ErrContestNotFound) {
		t.Fatalf("expected ErrContestNotFound, got %v", err)
	}
}

func TestGetStudentRankingsByContest_RepoErrorPropagates(t *testing.T) {
	boom := errors.New("dynamodb: table unavailable")
	uc := NewStudentUsecase(&stubStudentRepo{}, &stubPaymentRepo{},
		&rankStubSubmissionRepo{byContestErr: boom},
		&rankStubContestRepo{contests: map[string]domain.Contest{"c1": {ID: "c1"}}})
	if _, err := uc.GetStudentRankingsByContest("c1"); !errors.Is(err, boom) {
		t.Fatalf("expected repo error to propagate, got %v", err)
	}
}

func TestGetQuickStat_AggregatesScoresContestsAndApprovedPayment(t *testing.T) {
	student := &domain.Student{ID: "st-1", TelegramID: "700", Name: "Ada"}
	subs := []domain.Submission{
		rankSub("s-1", "c1", "st-1", "Ada", 10, rankTime(-2*time.Hour)),
		rankSub("s-2", "c2", "st-1", "Ada", 25, rankTime(-time.Hour)),
		rankSub("s-3", "c1", "st-2", "Bob", 40, rankTime(0)), // another student, ignored
	}
	now := time.Now().UTC()
	payments := []domain.PaymentRequest{
		{ID: "p-old", UserID: "st-1", Status: domain.StatusApproved, CreatedAt: now.Add(-72 * time.Hour)},
		{ID: "p-new", UserID: "st-1", Status: domain.StatusApproved, CreatedAt: now.Add(-48 * time.Hour)},
		// Newer than both approved rows: must NOT win, only Approved counts.
		{ID: "p-pending", UserID: "st-1", Status: domain.StatusPending, CreatedAt: now},
	}
	uc := NewStudentUsecase(
		&stubStudentRepo{byID: map[string]*domain.Student{"st-1": student}},
		&stubPaymentRepo{byUser: map[string][]domain.PaymentRequest{"st-1": payments}},
		&rankStubSubmissionRepo{subs: subs},
		&rankStubContestRepo{contests: map[string]domain.Contest{
			"c1": {ID: "c1", Title: "Contest One"},
			"c2": {ID: "c2", Title: "Contest Two"},
		}})

	stat, err := uc.GetQuickStat("st-1")
	if err != nil {
		t.Fatalf("GetQuickStat: %v", err)
	}
	if stat["name"] != "Ada" || stat["telegram_id"] != "700" {
		t.Fatalf("identity fields wrong: %+v", stat)
	}
	if got := toInt64(t, stat["totalPoints"]); got != 35 {
		t.Fatalf("totalPoints=%v, want 35 (10+25 official scores)", got)
	}
	if got := toInt64(t, stat["contestsCompleted"]); got != 2 {
		t.Fatalf("contestsCompleted=%v, want 2", got)
	}
	subsOut, ok := stat["contestSubmissions"].([]domain.Submission)
	if !ok || len(subsOut) != 2 {
		t.Fatalf("contestSubmissions wrong: %#v", stat["contestSubmissions"])
	}
	for _, s := range subsOut {
		if s.Contest.ID != s.ContestID {
			t.Fatalf("submission %s contest not hydrated: %+v", s.ID, s.Contest)
		}
	}
	pay, ok := stat["payment"].(*domain.PaymentRequest)
	if !ok || pay == nil || pay.ID != "p-new" {
		t.Fatalf("payment must be the newest approved row p-new, got %#v", stat["payment"])
	}
}

func TestGetQuickStat_NoApprovedPaymentIsNilAndNoSubmissionsIsZero(t *testing.T) {
	student := &domain.Student{ID: "st-9", TelegramID: "709", Name: "Zed"}
	uc := NewStudentUsecase(
		&stubStudentRepo{byID: map[string]*domain.Student{"st-9": student}},
		&stubPaymentRepo{byUser: map[string][]domain.PaymentRequest{
			"st-9": {{ID: "p1", UserID: "st-9", Status: domain.StatusRejected}},
		}},
		&rankStubSubmissionRepo{},
		&rankStubContestRepo{})

	stat, err := uc.GetQuickStat("st-9")
	if err != nil {
		t.Fatalf("GetQuickStat: %v", err)
	}
	if stat["payment"] != nil {
		t.Fatalf("payment must be nil without an approved row, got %#v", stat["payment"])
	}
	if got := toInt64(t, stat["totalPoints"]); got != 0 {
		t.Fatalf("totalPoints=%v, want 0", got)
	}
	if subsOut, ok := stat["contestSubmissions"].([]domain.Submission); !ok || len(subsOut) != 0 {
		t.Fatalf("contestSubmissions must be an empty non-nil slice, got %#v", stat["contestSubmissions"])
	}
}

func TestGetQuickStat_UnknownStudentIsNotFound(t *testing.T) {
	uc := NewStudentUsecase(&stubStudentRepo{}, &stubPaymentRepo{},
		&rankStubSubmissionRepo{}, &rankStubContestRepo{})
	_, err := uc.GetQuickStat("ghost")
	if !errors.Is(err, ErrStudentNotFound) {
		t.Fatalf("expected ErrStudentNotFound, got %v", err)
	}
}

func toInt64(t *testing.T, v interface{}) int64 {
	t.Helper()
	switch n := v.(type) {
	case int64:
		return n
	case int:
		return int64(n)
	default:
		t.Fatalf("expected integer type, got %T (%v)", v, v)
		return 0
	}
}

func toFloat64(t *testing.T, v interface{}) float64 {
	t.Helper()
	switch n := v.(type) {
	case float64:
		return n
	case int64:
		return float64(n)
	default:
		t.Fatalf("expected float64 type, got %T (%v)", v, v)
		return 0
	}
}
