package usecase

import (
	"errors"
	"testing"
	"time"

	"victory-contest-go/internal/domain"
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
	added  *domain.Submission
	latest *domain.Submission
}

func (r *capturedSubmissionRepo) AddSubmission(s domain.Submission) (string, error) {
	cp := s
	r.added = &cp
	return "sub-1", nil
}

func (r *capturedSubmissionRepo) GetSubmissionsByStudentAndContest(string, string) (*domain.Submission, error) {
	return r.latest, nil
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
		{ID: "q1", SelectedAnswer: 1},  // actually correct despite the claim
		{ID: "q2", SelectedAnswer: 1},  // actually wrong
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

// --- answer-index boundaries (B6 canonical: 1-based everywhere) ----------

// boundaryQuestions has 4 options each: the first option is answer 1 and
// the last is answer 4. Any off-by-one drift in the index convention makes
// the "all correct" sheet score wrong, which is exactly what this pins.
func boundaryQuestions() []domain.Question {
	opts := []string{"a", "b", "c", "d"}
	return []domain.Question{
		{ID: "q-first", Answer: 1, MultipleChoice: opts, QuestionText: "first?"},
		{ID: "q-mid", Answer: 2, MultipleChoice: opts, QuestionText: "mid?"},
		{ID: "q-last", Answer: 4, MultipleChoice: opts, QuestionText: "last?"},
	}
}

func boundaryContest() *domain.ContestTypeWithQuestionObj {
	obj := &domain.ContestTypeWithQuestionObj{}
	obj.Contest = domain.Contest{ID: "c1", Title: "Boundary", EndTime: time.Now().Add(-time.Hour).Format(time.RFC3339)}
	obj.Questions = boundaryQuestions()
	return obj
}

// A 1-based sheet picking the FIRST and LAST options must grade as correct;
// the same sheet shifted by -1 (the losing 0-based convention) must not.
func TestGradeSubmission_BoundaryAnswers(t *testing.T) {
	qs := boundaryQuestions()

	canonical := []domain.SubmissionMissedQuestionDto{
		{ID: "q-first", SelectedAnswer: 1}, // first option, 1-based
		{ID: "q-mid", SelectedAnswer: 2},
		{ID: "q-last", SelectedAnswer: 4}, // last option, 1-based
	}
	dto := domain.SubmissionDto{Answers: canonical}
	score, missed := gradeSubmission(qs, dto)
	if score != 3 {
		t.Fatalf("1-based boundary sheet scored %v, want 3", score)
	}
	if len(missed) != 0 {
		t.Fatalf("1-based boundary sheet left missed = %+v, want none", missed)
	}

	zeroBased := []domain.SubmissionMissedQuestionDto{
		{ID: "q-first", SelectedAnswer: 0},
		{ID: "q-mid", SelectedAnswer: 1},
		{ID: "q-last", SelectedAnswer: 3},
	}
	score, missed = gradeSubmission(qs, domain.SubmissionDto{Answers: zeroBased})
	if score != 0 {
		t.Fatalf("0-based sheet scored %v, want 0 (must never match 1-based answers)", score)
	}
	if len(missed) != 3 {
		t.Fatalf("0-based sheet missed = %+v, want all three", missed)
	}
}

// The editorial echoes selected_answer/user_answer in the same 1-based
// convention; first/last boundary rows must round-trip unshifted.
func TestGetStudentEditorial_BoundaryAnswers(t *testing.T) {
	repo := &capturedSubmissionRepo{latest: &domain.Submission{
		ID: "s1", ContestID: "c1", Score: 1,
		MissedQuestions: []domain.SubmissionMissedQuestionDto{
			{ID: "q-first", SelectedAnswer: 4}, // wrong: last option vs answer 1
			{ID: "q-mid", SelectedAnswer: -1},  // skipped
		},
	}}
	u := newScoringUsecase(repo, &scoringFakeContest{current: boundaryContest()})

	res, err := u.GetStudentEditorial("c1", "st-1")
	if err != nil {
		t.Fatalf("GetStudentEditorial: %v", err)
	}
	if len(res.Editorial) != 3 {
		t.Fatalf("editorial entries = %d, want 3", len(res.Editorial))
	}
	byID := map[string]domain.Editorial{}
	for _, e := range res.Editorial {
		byID[e.ID] = e
	}
	first := byID["q-first"]
	if first.UserAnswer != 4 || first.IsCorrect {
		t.Fatalf("q-first: user_answer=%v is_correct=%v, want 4/false unshifted", first.UserAnswer, first.IsCorrect)
	}
	if first.Answer != 1 {
		t.Fatalf("q-first: stored answer=%v, want 1 (first option, 1-based)", first.Answer)
	}
	last := byID["q-last"]
	if last.UserAnswer != 4 || !last.IsCorrect {
		t.Fatalf("q-last: user_answer=%v is_correct=%v, want 4/true (correct echo = stored 1-based answer)", last.UserAnswer, last.IsCorrect)
	}
	skipped := byID["q-mid"]
	if skipped.UserAnswer != -1 || skipped.IsCorrect {
		t.Fatalf("q-mid: user_answer=%v is_correct=%v, want -1/false", skipped.UserAnswer, skipped.IsCorrect)
	}
}
