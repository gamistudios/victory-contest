package usecase

import (
	"errors"
	"testing"
	"time"

	"victor-contest-go/internal/domain"
)

// --- fakes -------------------------------------------------------------

// scoringFakeContest is a minimal ContestUsecase for AddSubmission/editorial
// tests: it only knows one hydrated contest.
type scoringFakeContest struct {
	ContestUsecase // unimplemented methods panic if ever called

	current   *domain.ContestTypeWithQuestionObj
	getErr    error
	addedCons []domain.Contest
}

func (f *scoringFakeContest) GetContestByID(string) (*domain.ContestTypeWithQuestionObj, error) {
	return f.current, f.getErr
}

func (f *scoringFakeContest) GetAllContests() ([]domain.Contest, error) {
	if f.current == nil {
		return nil, nil
	}
	return []domain.Contest{f.current.Contest}, nil
}

func (f *scoringFakeContest) AddContest(c domain.Contest) (string, error) {
	f.addedCons = append(f.addedCons, c)
	return c.ID, nil
}

// capturedSubmissionRepo captures the row AddSubmission persists.
type capturedSubmissionRepo struct {
	stubSubmissionRepo
	added *domain.Submission
}

func (r *capturedSubmissionRepo) AddSubmission(s domain.Submission) (string, error) {
	cp := s
	r.added = &cp
	return "sub-1", nil
}

func (r *capturedSubmissionRepo) GetSubmissionsByStudentAndContest(string, string) (*domain.Submission, error) {
	return nil, nil // participated = false is fine for the gating tests
}

// nilStudentRepo stops the badge write at "student not found" so badge
// evaluation never touches DynamoDB in these tests.
type nilStudentRepo struct {
	StudentRepository
}

func (nilStudentRepo) GetStudentByID(string) (*domain.Student, error) { return nil, nil }

func scoringQuestions() []domain.Question {
	return []domain.Question{
		{ID: "q1", Answer: 1, QuestionText: "one?"},
		{ID: "q2", Answer: 2, QuestionText: "two?"},
		{ID: "q3", Answer: 3, QuestionText: "three?"},
	}
}

func scoringContest(endTime string) *domain.ContestTypeWithQuestionObj {
	obj := &domain.ContestTypeWithQuestionObj{}
	obj.Contest = domain.Contest{ID: "c1", Title: "Test", EndTime: endTime}
	obj.Questions = scoringQuestions()
	return obj
}

func scoringDto(score float64, missed, answers []domain.SubmissionMissedQuestionDto) domain.SubmissionDto {
	return domain.SubmissionDto{
		ContestID:       "c1",
		Student:         domain.StudentSub{ID: "st-1", Name: "Ana"},
		Score:           score,
		MissedQuestions: missed,
		Answers:         answers,
		TimeSpend:       "00:05:00",
	}
}

func newScoringUsecase(repo SubmissionRepository, con *scoringFakeContest) SubmissionUsecase {
	return &submissionUsecase{subRepo: repo, conUsecase: con, studentRepo: nilStudentRepo{}}
}

func missedOf(s *domain.Submission) map[string]int {
	out := map[string]int{}
	for _, m := range s.MissedQuestions {
		out[m.ID] = m.SelectedAnswer
	}
	return out
}

// --- server-authoritative scoring (README §9 #12) -----------------------

// A lying client (Score=100, but 2 of 3 questions missed on the legacy
// protocol) must be stored with the OFFICIAL score of 1, and the API must
// hand that official score back.
func TestAddSubmission_ClientLiesAboutScore(t *testing.T) {
	repo := &capturedSubmissionRepo{}
	u := newScoringUsecase(repo, &scoringFakeContest{current: scoringContest(time.Now().Add(time.Hour).Format(time.RFC3339))})

	missed := []domain.SubmissionMissedQuestionDto{
		{ID: "q2", SelectedAnswer: 9},
		{ID: "q3", SelectedAnswer: -1},
	}
	id, score, err := u.AddSubmission(scoringDto(100, missed, nil))
	if err != nil {
		t.Fatalf("AddSubmission: %v", err)
	}
	if id != "sub-1" {
		t.Fatalf("id = %q, want sub-1", id)
	}
	if score != 1 {
		t.Fatalf("returned score = %v, want 1", score)
	}
	if repo.added == nil {
		t.Fatal("nothing was persisted")
	}
	if repo.added.Score != 1 {
		t.Fatalf("stored score = %v, want 1 (client claim must be overwritten)", repo.added.Score)
	}
	if got := missedOf(repo.added); len(got) != 2 || got["q2"] != 9 || got["q3"] != -1 {
		t.Fatalf("stored missed = %v", got)
	}
}

// Missed ids that do not belong to the contest and duplicates must not
// change the math: 3 questions, 2 real (one of them twice) + 1 bogus missed
// ids => score 1.
func TestAddSubmission_LegacyMissedDedupAndForeignIDs(t *testing.T) {
	repo := &capturedSubmissionRepo{}
	u := newScoringUsecase(repo, &scoringFakeContest{current: scoringContest("")})

	missed := []domain.SubmissionMissedQuestionDto{
		{ID: "q2", SelectedAnswer: 1},
		{ID: "q2", SelectedAnswer: 1},
		{ID: "not-a-contest-q", SelectedAnswer: 2},
	}
	_, score, err := u.AddSubmission(scoringDto(0, missed, nil))
	if err != nil {
		t.Fatalf("AddSubmission: %v", err)
	}
	if score != 2 {
		t.Fatalf("score = %v, want 2 (duplicate and foreign ids ignored)", score)
	}
	if len(repo.added.MissedQuestions) != 1 || repo.added.MissedQuestions[0].ID != "q2" {
		t.Fatalf("stored missed = %+v, want exactly one q2 entry", repo.added.MissedQuestions)
	}
}

// With the full answer sheet (the new student flow) the server grades every
// question against the stored correct answer; anything unreported counts as
// skipped. The client's claimed missed list and score are irrelevant.
func TestAddSubmission_AnswerSheetGrading(t *testing.T) {
	repo := &capturedSubmissionRepo{}
	u := newScoringUsecase(repo, &scoringFakeContest{current: scoringContest("")})

	answers := []domain.SubmissionMissedQuestionDto{
		{ID: "q1", SelectedAnswer: 1}, // correct
		{ID: "q2", SelectedAnswer: 1}, // wrong
		// q3 deliberately absent -> skipped -> missed
	}
	_, score, err := u.AddSubmission(scoringDto(3, nil, answers))
	if err != nil {
		t.Fatalf("AddSubmission: %v", err)
	}
	if score != 1 {
		t.Fatalf("score = %v, want 1", score)
	}
	got := missedOf(repo.added)
	if len(got) != 2 {
		t.Fatalf("stored missed = %v, want q2 and q3", got)
	}
	if got["q2"] != 1 || got["q3"] != -1 {
		t.Fatalf("stored missed = %v, want q2 selection kept and q3 as skipped(-1)", got)
	}
}

// A stale client whose answers were stripped (README §9 #11) marks EVERY
// question missed, including the ones it actually got right. The server must
// grade such a payload as an answer sheet so honest work is never scored
// below the truth.
func TestAddSubmission_FullyCoveredMissedListIsGradedAsSheet(t *testing.T) {
	repo := &capturedSubmissionRepo{}
	u := newScoringUsecase(repo, &scoringFakeContest{current: scoringContest("")})

	missed := []domain.SubmissionMissedQuestionDto{
		{ID: "q1", SelectedAnswer: 1}, // actually correct despite the claim
		{ID: "q2", SelectedAnswer: 1}, // actually wrong
		{ID: "q3", SelectedAnswer: -1}, // skipped
	}
	_, score, err := u.AddSubmission(scoringDto(0, missed, nil))
	if err != nil {
		t.Fatalf("AddSubmission: %v", err)
	}
	if score != 1 {
		t.Fatalf("score = %v, want 1 (q1 selection matches the correct answer)", score)
	}
	if got := missedOf(repo.added); len(got) != 2 || got["q1"] == 1 {
		t.Fatalf("stored missed = %v, want q2+q3 only", got)
	}
}

func TestAddSubmission_RejectsMissingContest(t *testing.T) {
	repo := &capturedSubmissionRepo{}
	u := newScoringUsecase(repo, &scoringFakeContest{current: nil})

	if _, _, err := u.AddSubmission(scoringDto(5, nil, nil)); !errors.Is(err, ErrContestNotFound) {
		t.Fatalf("err = %v, want ErrContestNotFound", err)
	}
	if repo.added != nil {
		t.Fatal("nothing may be persisted for an unknown contest")
	}
}

func TestAddSubmission_RejectsContestWithoutQuestions(t *testing.T) {
	empty := scoringContest("")
	empty.Questions = nil
	repo := &capturedSubmissionRepo{}
	u := newScoringUsecase(repo, &scoringFakeContest{current: empty})

	if _, _, err := u.AddSubmission(scoringDto(5, nil, nil)); !errors.Is(err, ErrContestHasNoQuestions) {
		t.Fatalf("err = %v, want ErrContestHasNoQuestions", err)
	}
	if repo.added != nil {
		t.Fatal("nothing may be persisted for an ungradeable contest")
	}
}

func TestAddSubmission_RejectsMissingStudentID(t *testing.T) {
	repo := &capturedSubmissionRepo{}
	u := newScoringUsecase(repo, &scoringFakeContest{current: scoringContest("")})

	dto := scoringDto(1, nil, nil)
	dto.Student.ID = "  "
	if _, _, err := u.AddSubmission(dto); !errors.Is(err, ErrNoStudentID) {
		t.Fatalf("err = %v, want ErrNoStudentID", err)
	}
	if repo.added != nil {
		t.Fatal("a submission with an empty student key would be invisible to per-student queries")
	}
}

// --- editorial gating while live (README §9 #11) -------------------------

func TestGetStudentEditorial_LiveContestHidesAnswers(t *testing.T) {
	u := newScoringUsecase(&capturedSubmissionRepo{}, &scoringFakeContest{current: scoringContest(time.Now().Add(time.Hour).Format(time.RFC3339))})

	res, err := u.GetStudentEditorial("c1", "st-1")
	if err != nil {
		t.Fatalf("GetStudentEditorial: %v", err)
	}
	if len(res.Editorial) != 0 {
		t.Fatalf("live contest must expose no judged questions, got %d", len(res.Editorial))
	}
	if res.Message == "" {
		t.Fatal("live contest must carry an explanatory message")
	}
}

func TestGetStudentEditorial_EndedContestKeepsAnswers(t *testing.T) {
	u := newScoringUsecase(&capturedSubmissionRepo{}, &scoringFakeContest{current: scoringContest(time.Now().Add(-time.Hour).Format(time.RFC3339))})

	res, err := u.GetStudentEditorial("c1", "st-1")
	if err != nil {
		t.Fatalf("GetStudentEditorial: %v", err)
	}
	if len(res.Editorial) != 3 {
		t.Fatalf("ended contest must expose the full editorial, got %d entries", len(res.Editorial))
	}
	for _, e := range res.Editorial {
		if e.Answer == 0 {
			t.Fatalf("editorial question %s lost its correct answer", e.ID)
		}
	}
}

func TestContestHasEnded(t *testing.T) {
	if ContestHasEnded(time.Now().Add(time.Hour).Format(time.RFC3339)) {
		t.Fatal("future end_time must count as live")
	}
	if ContestHasEnded("") || ContestHasEnded("garbage") {
		t.Fatal("unset/unparseable end_time must fail closed (live)")
	}
	if !ContestHasEnded(time.Now().Add(-time.Hour).Format(time.RFC3339)) {
		t.Fatal("past end_time must count as ended")
	}
}
