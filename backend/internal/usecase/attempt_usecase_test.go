package usecase

import (
	"errors"
	"testing"
	"time"

	"victory-contest-go/internal/domain"
)

// ---- fakes ----------------------------------------------------------------
// The fake attempt repository mirrors the DynamoDB conditional writes of
// repository.AttemptDynamoRepository: Create fails when the id exists,
// UpdateAnswers checks status+version, Finalise only succeeds while in_progress.

type fakeAttempts struct {
	rows map[string]domain.Attempt
}

func newFakeAttempts() *fakeAttempts {
	return &fakeAttempts{rows: map[string]domain.Attempt{}}
}

func (f *fakeAttempts) Create(a domain.Attempt) error {
	if _, ok := f.rows[a.ID]; ok {
		return ErrAlreadyAttempted
	}
	f.rows[a.ID] = a
	return nil
}

func (f *fakeAttempts) Get(id string) (*domain.Attempt, error) {
	a, ok := f.rows[id]
	if !ok {
		return nil, nil
	}
	return &a, nil
}

func (f *fakeAttempts) UpdateAnswers(id string, answers map[string]int, flagged []string, expectedVersion int) error {
	a, ok := f.rows[id]
	if !ok || a.Status != domain.AttemptInProgress || a.AnswersVersion != expectedVersion {
		return ErrVersionConflict
	}
	a.Answers = answers
	a.Flagged = flagged
	a.AnswersVersion = expectedVersion + 1
	f.rows[id] = a
	return nil
}

func (f *fakeAttempts) Finalise(a domain.Attempt) error {
	cur, ok := f.rows[a.ID]
	if !ok || cur.Status != domain.AttemptInProgress {
		return ErrAttemptFinalised
	}
	f.rows[a.ID] = a
	return nil
}

func (f *fakeAttempts) Put(a domain.Attempt) error {
	f.rows[a.ID] = a
	return nil
}

func (f *fakeAttempts) Delete(id string) error {
	delete(f.rows, id)
	return nil
}

func (f *fakeAttempts) ListByStudent(studentID string) ([]domain.Attempt, error) {
	var out []domain.Attempt
	for _, a := range f.rows {
		if a.StudentID == studentID {
			out = append(out, a)
		}
	}
	return out, nil
}

func (f *fakeAttempts) ListByContest(contestID string) ([]domain.Attempt, error) {
	var out []domain.Attempt
	for _, a := range f.rows {
		if a.ContestID == contestID {
			out = append(out, a)
		}
	}
	return out, nil
}

func (f *fakeAttempts) ListExpired(cutoff string) ([]domain.Attempt, error) {
	var out []domain.Attempt
	for _, a := range f.rows {
		if a.Status == domain.AttemptInProgress && a.ExpiresAt < cutoff {
			out = append(out, a)
		}
	}
	return out, nil
}

func (f *fakeAttempts) CountsByContest() (map[string]int, error) {
	out := map[string]int{}
	for _, a := range f.rows {
		out[a.ContestID]++
	}
	return out, nil
}

type fakeAttemptContests struct {
	ContestRepository
	cs map[string]domain.Contest
}

func (f *fakeAttemptContests) GetContestByID(id string) (*domain.Contest, error) {
	c, ok := f.cs[id]
	if !ok {
		return nil, nil
	}
	return &c, nil
}

func (f *fakeAttemptContests) GetAllContests() ([]domain.Contest, error) {
	var out []domain.Contest
	for _, c := range f.cs {
		out = append(out, c)
	}
	return out, nil
}

type fakeAttemptQuestions struct {
	QuestionRepository
	qs map[string]domain.Question
}

func (f *fakeAttemptQuestions) GetQuestionByID(id string) (*domain.Question, error) {
	q, ok := f.qs[id]
	if !ok {
		return nil, nil
	}
	return &q, nil
}

type fakeAttemptStudents struct {
	StudentRepository
	st map[string]*domain.Student
}

func (f *fakeAttemptStudents) GetStudentByID(id string) (*domain.Student, error) {
	return f.st[id], nil
}

type fakeAttemptSubmissions struct {
	SubmissionRepository
	added []domain.Submission
	n     int
}

func (f *fakeAttemptSubmissions) AddSubmission(s domain.Submission) (string, error) {
	f.n++
	id := "sub" + s.AttemptID
	s.ID = id
	f.added = append(f.added, s)
	return id, nil
}

// ---- fixture ---------------------------------------------------------------

var t0 = time.Date(2026, 10, 16, 12, 0, 0, 0, time.UTC)

func newAttemptFixture() (*AttemptUsecase, *fakeAttempts, *fakeAttemptContests, *fakeAttemptSubmissions) {
	att := newFakeAttempts()
	contests := &fakeAttemptContests{cs: map[string]domain.Contest{}}
	questions := &fakeAttemptQuestions{qs: map[string]domain.Question{
		"q1": {ID: "q1", Answer: 1, MultipleChoice: []string{"a", "b"}},
		"q2": {ID: "q2", Answer: 2, MultipleChoice: []string{"a", "b"}},
	}}
	students := &fakeAttemptStudents{st: map[string]*domain.Student{
		"s1": {ID: "s1", Name: "Ada"},
		"s2": {ID: "s2", Name: "Bob"},
	}}
	subs := &fakeAttemptSubmissions{}
	u := NewAttemptUsecase(att, contests, questions, students, subs)
	u.now = func() time.Time { return t0 }
	return u, att, contests, subs
}

func selfPacedContest() domain.Contest {
	return domain.Contest{
		ID: "c1", Title: "Physics", Mode: domain.ContestModeSelfPaced,
		StartTime:       t0.Add(-2 * time.Hour).Format(time.RFC3339),
		EndTime:         t0.Add(2 * time.Hour).Format(time.RFC3339),
		DurationMinutes: 60, LatePenaltyPercent: 10,
		Questions: []string{"q1", "q2"},
	}
}

// ---- Start / resume / duplicate -------------------------------------------

func TestStartCreatesAttemptAndResumes(t *testing.T) {
	u, att, contests, _ := newAttemptFixture()
	contests.cs["c1"] = selfPacedContest()

	res, err := u.Start("c1", "s1")
	if err != nil {
		t.Fatal(err)
	}
	if res.Resumed || res.Attempt.Status != domain.AttemptInProgress {
		t.Fatalf("first start: resumed=%v status=%v", res.Resumed, res.Attempt.Status)
	}
	if res.Attempt.ID != "c1#s1#1" {
		t.Fatalf("id = %s", res.Attempt.ID)
	}
	if len(res.Questions) != 2 {
		t.Fatalf("questions = %d", len(res.Questions))
	}
	want := t0.Add(60 * time.Minute).Format(time.RFC3339)
	if res.Attempt.ExpiresAt != want {
		t.Fatalf("expires_at = %s, want %s (started_at + duration)", res.Attempt.ExpiresAt, want)
	}

	res2, err := u.Start("c1", "s1")
	if err != nil {
		t.Fatal(err)
	}
	if !res2.Resumed || res2.Attempt.ID != res.Attempt.ID {
		t.Fatal("second start must resume the same attempt")
	}
	if len(att.rows) != 1 {
		t.Fatalf("resume created a second row: %d", len(att.rows))
	}
}

func TestStartAfterFinaliseReturnsAlreadyAttempted(t *testing.T) {
	u, _, contests, _ := newAttemptFixture()
	contests.cs["c1"] = selfPacedContest()
	res, _ := u.Start("c1", "s1")
	if _, err := u.Submit(res.Attempt.ID, "s1", map[string]int{"q1": 1, "q2": 2}); err != nil {
		t.Fatal(err)
	}
	if _, err := u.Start("c1", "s1"); !errors.Is(err, ErrAlreadyAttempted) {
		t.Fatalf("want already_attempted, got %v", err)
	}
}

func TestGlobalWindowClosedSelfPacedStaysOpen(t *testing.T) {
	u, _, contests, _ := newAttemptFixture()
	legacy := selfPacedContest()
	legacy.Mode = "" // legacy global
	legacy.EndTime = t0.Add(-time.Hour).Format(time.RFC3339)
	contests.cs["c1"] = legacy
	if _, err := u.Start("c1", "s1"); !errors.Is(err, ErrWindowClosed) {
		t.Fatalf("global after end: got %v", err)
	}
	future := selfPacedContest()
	future.StartTime = t0.Add(time.Hour).Format(time.RFC3339)
	contests.cs["c1"] = future
	if _, err := u.Start("c1", "s1"); !errors.Is(err, ErrNotOpenYet) {
		t.Fatalf("before open: got %v", err)
	}
	// self_paced with EndTime in the past still opens (decision 5: no upper start limit)
	late := selfPacedContest()
	late.EndTime = t0.Add(-time.Hour).Format(time.RFC3339)
	contests.cs["c1"] = late
	if _, err := u.Start("c1", "s1"); err != nil {
		t.Fatalf("self-paced after until-time must start: %v", err)
	}
}

func TestAccessGateBlocksStart(t *testing.T) {
	u, _, contests, _ := newAttemptFixture()
	contests.cs["c1"] = selfPacedContest()
	u.Access = func(string, domain.Contest) error {
		return &LockedError{Lock: LockFor(LockedPremium, "grade-12")}
	}
	_, err := u.Start("c1", "s1")
	var le *LockedError
	if !errors.As(err, &le) {
		t.Fatalf("want LockedError, got %v", err)
	}
}

// ---- Autosave ---------------------------------------------------------------

func TestAutosaveVersionAndGrace(t *testing.T) {
	u, att, contests, _ := newAttemptFixture()
	contests.cs["c1"] = selfPacedContest()
	res, _ := u.Start("c1", "s1")
	id := res.Attempt.ID

	v, now, err := u.Autosave(id, "s1", map[string]int{"q1": 1}, []string{"q2"}, 0)
	if err != nil || v != 1 || now == "" {
		t.Fatalf("autosave: v=%d now=%q err=%v", v, now, err)
	}
	if _, _, err := u.Autosave(id, "s1", map[string]int{"q1": 2}, nil, 0); !errors.Is(err, ErrVersionConflict) {
		t.Fatalf("stale version: got %v", err)
	}
	if _, _, err := u.Autosave(id, "s2", map[string]int{}, nil, 1); !errors.Is(err, ErrForbidden) {
		t.Fatalf("other student: got %v", err)
	}
	// past expires_at + 30 s grace
	u.now = func() time.Time { return t0.Add(61 * time.Minute) }
	if _, _, err := u.Autosave(id, "s1", map[string]int{}, nil, 1); !errors.Is(err, ErrAttemptExpired) {
		t.Fatalf("after grace: got %v", err)
	}
	_ = att
}

// ---- Submit / finalise ------------------------------------------------------

func TestSubmitLateAppliesPenaltyAndWritesSubmission(t *testing.T) {
	u, _, contests, subs := newAttemptFixture()
	c := selfPacedContest()
	c.EndTime = t0.Add(-time.Minute).Format(time.RFC3339) // submitted after "until" => late
	contests.cs["c1"] = c
	res, _ := u.Start("c1", "s1")
	a, err := u.Submit(res.Attempt.ID, "s1", map[string]int{"q1": 1, "q2": 2})
	if err != nil {
		t.Fatal(err)
	}
	if !a.IsLate || a.PenaltyPercent != 10 {
		t.Fatalf("late=%v penalty=%d", a.IsLate, a.PenaltyPercent)
	}
	if a.Points != 90 { // 2/2 = 100, -10% = 90
		t.Fatalf("points = %d, want 90", a.Points)
	}
	if len(subs.added) != 1 || subs.added[0].Points != 90 || subs.added[0].Score != 2 {
		t.Fatalf("submissions = %+v", subs.added)
	}
	if subs.added[0].Score != float64(a.Correct) {
		t.Fatal("submission Score must stay the raw correct count")
	}
}

func TestSubmitAfterGraceAutoSubmitsFromExpiresAt(t *testing.T) {
	u, _, contests, subs := newAttemptFixture()
	contests.cs["c1"] = selfPacedContest()
	res, _ := u.Start("c1", "s1")
	id := res.Attempt.ID
	if _, _, err := u.Autosave(id, "s1", map[string]int{"q1": 1, "q2": 2}, nil, 0); err != nil {
		t.Fatal(err)
	}
	// 5 hours after the 60-minute limit; effective submit time must be expires_at
	u.now = func() time.Time { return t0.Add(5 * time.Hour) }
	a, err := u.Submit(id, "s1", map[string]int{"q1": 1, "q2": 1}) // client's final map ignored
	if err != nil {
		t.Fatal(err)
	}
	if a.Status != domain.AttemptAutoSubmitted {
		t.Fatalf("status = %s", a.Status)
	}
	if a.SubmittedAt != res.Attempt.ExpiresAt {
		t.Fatalf("submitted_at = %s, want expires_at %s", a.SubmittedAt, res.Attempt.ExpiresAt)
	}
	// expires 13:00 is before the until-time 14:00: on time, full points from the autosaved answers
	if a.IsLate || a.Points != 100 {
		t.Fatalf("late=%v points=%d, want on-time 100 (client's final map must be ignored after grace)", a.IsLate, a.Points)
	}
	if len(subs.added) != 1 {
		t.Fatalf("submission rows = %d", len(subs.added))
	}
}

func TestExpiredWithoutAnswersIsAbandonedAndIdempotent(t *testing.T) {
	u, _, contests, subs := newAttemptFixture()
	contests.cs["c1"] = selfPacedContest()
	res, _ := u.Start("c1", "s1")
	id := res.Attempt.ID
	u.now = func() time.Time { return t0.Add(2 * time.Hour) }
	a, err := u.Submit(id, "s1", nil)
	if err != nil {
		t.Fatal(err)
	}
	if a.Status != domain.AttemptAbandoned {
		t.Fatalf("status = %s, want abandoned", a.Status)
	}
	if len(subs.added) != 0 {
		t.Fatal("abandoned attempts record no submission")
	}
	// second submit is idempotent: same finalised row, no new submission
	again, err := u.Submit(id, "s1", map[string]int{"q1": 1})
	if err != nil || again.Status != domain.AttemptAbandoned || len(subs.added) != 0 {
		t.Fatalf("idempotent resubmit: %v %+v subs=%d", err, again.Status, len(subs.added))
	}
}

func TestSweeperFinalisesExpiredAndIsRepeatSafe(t *testing.T) {
	u, att, contests, subs := newAttemptFixture()
	contests.cs["c1"] = selfPacedContest()
	if _, err := u.Start("c1", "s1"); err != nil {
		t.Fatal(err)
	}
	if _, err := u.Start("c1", "s2"); err != nil { // s2 answered => auto_submitted
		t.Fatal(err)
	}
	if err := att.UpdateAnswers("c1#s2#1", map[string]int{"q1": 1, "q2": 2}, nil, 0); err != nil {
		t.Fatal(err)
	}
	u.now = func() time.Time { return t0.Add(2 * time.Hour) }
	if n := u.SweepExpired(); n != 2 {
		t.Fatalf("swept %d, want 2", n)
	}
	if n := u.SweepExpired(); n != 0 {
		t.Fatalf("second sweep must finalise nothing, got %d", n)
	}
	if len(subs.added) != 1 {
		t.Fatalf("only the answered attempt records a submission, got %d", len(subs.added))
	}
	a := att.rows["c1#s1#1"]
	if a.Status != domain.AttemptAbandoned || a.SubmittedAt != a.ExpiresAt {
		t.Fatalf("sweeper must use expires_at as effective submit time: %+v", a)
	}
}

// ---- Result visibility -------------------------------------------------------

func TestResultHidesAnswersUntilReveal(t *testing.T) {
	u, _, contests, _ := newAttemptFixture()
	contests.cs["c1"] = selfPacedContest() // reveal defaults to at_end, EndTime = t0+2h
	res, _ := u.Start("c1", "s1")
	id := res.Attempt.ID
	if _, err := u.Submit(id, "s1", map[string]int{"q1": 1, "q2": 2}); err != nil {
		t.Fatal(err)
	}
	v, err := u.Result(id, "s1")
	if err != nil {
		t.Fatal(err)
	}
	if v.Attempt.Points == 0 {
		t.Fatal("score must be shown immediately")
	}
	if v.AnswersVisible || len(v.Editorial) != 0 {
		t.Fatal("answers must stay hidden before the until-time")
	}
	if v.RevealAt != contests.cs["c1"].EndTime {
		t.Fatalf("reveal_at = %q, want %q", v.RevealAt, contests.cs["c1"].EndTime)
	}
	if v.Attempt.Answers != nil {
		t.Fatal("draft answers must not leak through the result payload")
	}
	u.now = func() time.Time { return t0.Add(3 * time.Hour) }
	v, err = u.Result(id, "s1")
	if err != nil {
		t.Fatal(err)
	}
	if !v.AnswersVisible || len(v.Editorial) != 2 {
		t.Fatalf("after until-time: visible=%v editorial=%d", v.AnswersVisible, len(v.Editorial))
	}
}

// ---- Admin actions -----------------------------------------------------------

func TestAdminActionsExcludeWaiveRegradeReset(t *testing.T) {
	u, att, contests, subs := newAttemptFixture()
	c := selfPacedContest()
	c.EndTime = t0.Add(-time.Minute).Format(time.RFC3339) // late
	contests.cs["c1"] = c
	res, _ := u.Start("c1", "s1")
	id := res.Attempt.ID
	a, _ := u.Submit(id, "s1", map[string]int{"q1": 1, "q2": 2})
	if a.Points != 90 {
		t.Fatalf("points = %d", a.Points)
	}

	if _, err := u.AdminAction(id, "exclude", ""); err == nil {
		t.Fatal("exclude requires a reason")
	}
	if _, err := u.AdminAction(id, "exclude", "cheating"); err != nil {
		t.Fatal(err)
	}
	if !att.rows[id].Excluded || att.rows[id].Label() != "excluded" {
		t.Fatal("exclude not applied")
	}

	out, err := u.AdminAction(id, "waive_penalty", "")
	if err != nil {
		t.Fatal(err)
	}
	if out.PenaltyPercent != 0 || out.Points != 100 {
		t.Fatalf("after waive: penalty=%d points=%d", out.PenaltyPercent, out.Points)
	}

	// regrade uses the stored answers: drop q2's answer to 1 wrong of 2
	if err := att.Put(func() domain.Attempt { r := att.rows[id]; r.Answers["q2"] = 1; return r }()); err != nil {
		t.Fatal(err)
	}
	out, err = u.AdminAction(id, "regrade", "")
	if err != nil {
		t.Fatal(err)
	}
	if out.Correct != 1 || out.Points != 50 {
		t.Fatalf("after regrade: correct=%d points=%d", out.Correct, out.Points)
	}

	if _, err := u.AdminAction(id, "reset", ""); err == nil {
		t.Fatal("reset requires a reason")
	}
	if _, err := u.AdminAction(id, "reset", "server outage"); err != nil {
		t.Fatal(err)
	}
	if _, ok := att.rows[id]; ok {
		t.Fatal("reset must delete the attempt")
	}
	if len(subs.added) != 1 {
		t.Fatal("the submission snapshot is kept in the fake; delete is wired via the optional interface")
	}
	// after reset a fresh first attempt can be recorded
	if _, err := u.Start("c1", "s1"); err != nil {
		t.Fatalf("start after reset: %v", err)
	}
}

func TestAdminAttemptsLabelFilter(t *testing.T) {
	u, _, contests, _ := newAttemptFixture()
	c := selfPacedContest()
	c.EndTime = t0.Add(-time.Minute).Format(time.RFC3339) // s1 will be late
	contests.cs["c1"] = c
	r1, _ := u.Start("c1", "s1")
	if _, err := u.Submit(r1.Attempt.ID, "s1", map[string]int{"q1": 1, "q2": 2}); err != nil {
		t.Fatal(err)
	}
	r2, _ := u.Start("c1", "s2")
	if _, err := u.Submit(r2.Attempt.ID, "s2", map[string]int{"q1": 1, "q2": 2}); err != nil {
		t.Fatal(err)
	}
	late, err := u.AdminAttempts("c1", "late")
	if err != nil || len(late) != 2 {
		t.Fatalf("both are late: %d %v", len(late), err)
	}
	if got, _ := u.AdminAttempts("c1", "on_time"); len(got) != 0 {
		t.Fatalf("on_time = %d", len(got))
	}
}

// ---- SubmitLegacy bridge -----------------------------------------------------

func TestSubmitLegacyBridge(t *testing.T) {
	u, att, contests, subs := newAttemptFixture()
	dto := domain.SubmissionDto{
		ContestID: "c1", Student: domain.StudentSub{ID: "s1"},
		Answers: []domain.SubmissionMissedQuestionDto{{ID: "q1", SelectedAnswer: 1}, {ID: "q2", SelectedAnswer: 1}},
	}
	// legacy row (empty mode) falls through to the old path
	contests.cs["c1"] = domain.Contest{ID: "c1", Questions: []string{"q1", "q2"}}
	if _, _, err := u.SubmitLegacy(dto); !errors.Is(err, ErrNotPhase2) {
		t.Fatalf("legacy row: got %v", err)
	}
	// Phase 2 row goes through the attempt engine
	contests.cs["c1"] = selfPacedContest()
	id, score, err := u.SubmitLegacy(dto)
	if err != nil {
		t.Fatal(err)
	}
	if score != 1 {
		t.Fatalf("server-computed score = %v, want 1 correct", score)
	}
	a := att.rows["c1#s1#1"]
	if a.Status != domain.AttemptSubmitted || a.SubmissionID != id {
		t.Fatalf("attempt after bridge submit: %+v", a)
	}
	if len(subs.added) != 1 || subs.added[0].TimeSpend == "" {
		t.Fatalf("submission = %+v", subs.added)
	}
	// duplicate submit is refused (the old path had no guard)
	if _, _, err := u.SubmitLegacy(dto); !errors.Is(err, ErrAlreadySubmitted) {
		t.Fatalf("duplicate: got %v", err)
	}
	// window closed for global mode
	g := selfPacedContest()
	g.Mode = domain.ContestModeGlobal
	g.EndTime = t0.Add(-time.Hour).Format(time.RFC3339)
	contests.cs["c1"] = g
	if _, _, err := u.SubmitLegacy(domain.SubmissionDto{ContestID: "c1", Student: domain.StudentSub{ID: "s2"}}); !errors.Is(err, ErrWindowClosed) {
		t.Fatalf("closed window: got %v", err)
	}
}
