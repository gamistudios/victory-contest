package usecase

import (
	"fmt"
	"log"
	"math/rand"
	"time"

	"victory-contest-go/internal/domain"
)

// AttemptRepository is implemented by repository.AttemptDynamoRepository.
type AttemptRepository interface {
	Create(a domain.Attempt) error
	Get(id string) (*domain.Attempt, error)
	UpdateAnswers(id string, answers map[string]int, flagged []string, expectedVersion int) error
	Finalise(a domain.Attempt) error
	Put(a domain.Attempt) error
	Delete(id string) error
	ListByStudent(studentID string) ([]domain.Attempt, error)
	ListByContest(contestID string) ([]domain.Attempt, error)
	ListExpired(cutoff string) ([]domain.Attempt, error)
	// CountsByContest returns attempts per contest id (admin list column).
	CountsByContest() (map[string]int, error)
}

type attemptQuestionBatch interface {
	GetByIDs(ids []string) ([]domain.Question, error)
}

// AttemptUsecase implements the attempt lifecycle of plan §5.4.2.
type AttemptUsecase struct {
	attempts    AttemptRepository
	contests    ContestRepository
	questions   QuestionRepository
	students    StudentRepository
	submissions SubmissionRepository
	now         func() time.Time
	// Access, when set, is called on Start (plan §5.3). Returning an error
	// (e.g. a 402 lock) blocks the attempt. Wired by the router.
	Access func(studentID string, c domain.Contest) error
	// OnSubmission, when set, runs after each submission row is written
	// (badge evaluation for THIS attempt only). Errors are logged.
	OnSubmission SubmitHook
	// Roster, when set, is the contest-registration table. The legacy exam page
	// wrote it on entry and its card let a student join only after they had
	// signed up, so the Phase 2 routes need the same three moves.
	Roster Roster
}

// Roster is the contest-registration side of an assessment, satisfied by
// ContestRegistrationUsecase.
type Roster interface {
	CheckRegistrationsByContestAndStudent(contestID, studentID string) (bool, error)
	Register(contestID, studentID string) error
	EnsureActive(contestID, studentID string) error
}

func NewAttemptUsecase(a AttemptRepository, c ContestRepository, q QuestionRepository, s StudentRepository, sub SubmissionRepository) *AttemptUsecase {
	return &AttemptUsecase{attempts: a, contests: c, questions: q, students: s, submissions: sub, now: func() time.Time { return time.Now().UTC() }}
}

// StartResult is what POST /assessments/:id/start returns: questions WITHOUT answers.
type StartResult struct {
	Attempt   domain.Attempt   `json:"attempt"`
	Questions []PublicQuestion `json:"questions"`
	ServerNow string           `json:"server_now"`
	Resumed   bool             `json:"resumed"`
}

type PublicQuestion struct {
	ID             string   `json:"id"`
	QuestionText   string   `json:"question_text"`
	QuestionImg    string   `json:"question_image"`
	MultipleChoice []string `json:"multiple_choice"`
	OptionImages   []string `json:"option_images"`
}

func (u *AttemptUsecase) loadQuestions(ids []string) ([]domain.Question, error) {
	if bg, ok := u.questions.(attemptQuestionBatch); ok {
		return bg.GetByIDs(ids)
	}
	var out []domain.Question
	for _, id := range ids {
		q, err := u.questions.GetQuestionByID(id)
		if err != nil {
			return nil, err
		}
		if q != nil {
			out = append(out, *q)
		}
	}
	return out, nil
}

func ordered(qs []domain.Question, order []string) []domain.Question {
	if len(order) == 0 {
		return qs
	}
	by := map[string]domain.Question{}
	for _, q := range qs {
		by[q.ID] = q
	}
	out := make([]domain.Question, 0, len(qs))
	for _, id := range order {
		if q, ok := by[id]; ok {
			out = append(out, q)
		}
	}
	return out
}

func toPublic(qs []domain.Question) []PublicQuestion {
	out := make([]PublicQuestion, 0, len(qs))
	for _, q := range qs {
		out = append(out, PublicQuestion{ID: q.ID, QuestionText: q.QuestionText, QuestionImg: q.QuestionImg, MultipleChoice: q.MultipleChoice, OptionImages: q.OptionImages})
	}
	return out
}

// Register records the student on the assessment's roster. It is the legacy
// registration page's write, and it deliberately does not check the premium
// lock or the window: signing up was never access, and Start still gates both.
func (u *AttemptUsecase) Register(contestID, studentID string) error {
	if u.Roster == nil {
		return nil
	}
	c, err := u.contests.GetContestByID(contestID)
	if err != nil || c == nil {
		return ErrAssessmentNotFound
	}
	if !c.NeedsRegistration() {
		return nil
	}
	return u.Roster.Register(contestID, studentID)
}

// noteRoster makes the roster write the legacy exam page left behind when a
// student entered a contest. The admin dashboard counts registrations per
// contest and trends their dates, so the write has to follow the attempt
// engine. It is never fatal: a stats row must not block a student's exam.
func (u *AttemptUsecase) noteRoster(c domain.Contest, studentID string) {
	if u.Roster == nil || !c.NeedsRegistration() {
		return
	}
	if err := u.Roster.EnsureActive(c.ID, studentID); err != nil {
		log.Printf("roster write for contest %s student %s: %v", c.ID, studentID, err)
	}
}

// Start creates the first attempt or resumes the in-progress one.
func (u *AttemptUsecase) Start(contestID, studentID string) (*StartResult, error) {
	c, err := u.contests.GetContestByID(contestID)
	if err != nil || c == nil {
		return nil, ErrAssessmentNotFound
	}
	id := domain.AttemptID(contestID, studentID)
	now := u.now()
	if ex, err := u.attempts.Get(id); err != nil {
		return nil, err
	} else if ex != nil {
		ex, err = u.lazyFinalise(*c, ex)
		if err != nil {
			return nil, err
		}
		if ex.Finalised() {
			return nil, ErrAlreadyAttempted
		}
		qs, err := u.loadQuestions(c.Questions)
		if err != nil {
			return nil, err
		}
		u.noteRoster(*c, studentID)
		return &StartResult{Attempt: *ex, Questions: toPublic(ordered(qs, ex.Order)), ServerNow: now.Format(time.RFC3339), Resumed: true}, nil
	}
	if err := CheckStartWindow(*c, now); err != nil {
		return nil, err
	}
	if u.Access != nil {
		if err := u.Access(studentID, *c); err != nil {
			return nil, err
		}
	}
	qs, err := u.loadQuestions(c.Questions)
	if err != nil {
		return nil, err
	}
	order := make([]string, 0, len(qs))
	for _, q := range qs {
		order = append(order, q.ID)
	}
	if c.ShuffleQuestions {
		rand.Shuffle(len(order), func(i, j int) { order[i], order[j] = order[j], order[i] })
	}
	a := domain.Attempt{
		ID: id, ContestID: contestID, StudentID: studentID, Scope: c.Scope,
		Mode: c.EffectiveMode(), Status: domain.AttemptInProgress,
		StartedAt: now.Format(time.RFC3339), ExpiresAt: ComputeExpiresAt(*c, now).Format(time.RFC3339),
		Order: order, Total: len(qs), PenaltyPercent: 0,
	}
	if st, err := u.students.GetStudentByID(studentID); err == nil && st != nil && c.Scope != nil {
		for _, e := range st.Enrollments {
			if e.ProgramID == c.Scope.ProgramID {
				a.StudentStreamID = e.StreamID
			}
		}
	}
	if err := u.attempts.Create(a); err != nil {
		return nil, err
	}
	u.noteRoster(*c, studentID)
	return &StartResult{Attempt: a, Questions: toPublic(ordered(qs, order)), ServerNow: now.Format(time.RFC3339)}, nil
}

// Autosave stores a draft; rejected after expires_at + grace.
func (u *AttemptUsecase) Autosave(attemptID, studentID string, answers map[string]int, flagged []string, version int) (int, string, error) {
	a, err := u.ownedAttempt(attemptID, studentID)
	if err != nil {
		return 0, "", err
	}
	now := u.now()
	if a.Finalised() {
		return 0, "", ErrAttemptFinalised
	}
	if exp, ok := parseAttemptTime(a.ExpiresAt); ok && now.After(exp.Add(AttemptGrace)) {
		return 0, "", ErrAttemptExpired
	}
	if err := u.attempts.UpdateAnswers(a.ID, answers, flagged, version); err != nil {
		return 0, "", err
	}
	return version + 1, now.Format(time.RFC3339), nil
}

func (u *AttemptUsecase) ownedAttempt(attemptID, studentID string) (*domain.Attempt, error) {
	a, err := u.attempts.Get(attemptID)
	if err != nil {
		return nil, err
	}
	if a == nil {
		return nil, ErrAttemptNotFound
	}
	if a.StudentID != studentID {
		return nil, ErrForbidden
	}
	return a, nil
}

// Submit grades the stored (and any final) answers, finalises and writes the submission.
func (u *AttemptUsecase) Submit(attemptID, studentID string, final map[string]int) (*domain.Attempt, error) {
	a, err := u.ownedAttempt(attemptID, studentID)
	if err != nil {
		return nil, err
	}
	if a.Finalised() {
		return a, nil // idempotent
	}
	c, err := u.contests.GetContestByID(a.ContestID)
	if err != nil || c == nil {
		return nil, ErrAssessmentNotFound
	}
	now := u.now()
	if exp, ok := parseAttemptTime(a.ExpiresAt); ok && now.After(exp.Add(AttemptGrace)) {
		return u.finalise(*c, a, domain.AttemptAutoSubmitted, now)
	}
	if final != nil {
		a.Answers = final
	}
	return u.finalise(*c, a, domain.AttemptSubmitted, now)
}

func (u *AttemptUsecase) lazyFinalise(c domain.Contest, a *domain.Attempt) (*domain.Attempt, error) {
	if a.Finalised() {
		return a, nil
	}
	if exp, ok := parseAttemptTime(a.ExpiresAt); ok && u.now().After(exp.Add(AttemptGrace)) {
		return u.finalise(c, a, domain.AttemptAutoSubmitted, u.now())
	}
	return a, nil
}

// finalise is idempotent via the repository's conditional write on status=in_progress.
func (u *AttemptUsecase) finalise(c domain.Contest, a *domain.Attempt, status string, now time.Time) (*domain.Attempt, error) {
	if status == domain.AttemptAutoSubmitted && len(a.Answers) == 0 {
		status = domain.AttemptAbandoned
	}
	a.Status = status
	a.SubmittedAt = now.Format(time.RFC3339)
	if status == domain.AttemptAutoSubmitted || status == domain.AttemptAbandoned {
		a.SubmittedAt = a.ExpiresAt // effective submit time = when their time ran out
	}
	qs, err := u.loadQuestions(c.Questions)
	if err != nil {
		return nil, err
	}
	a.Correct, a.Total = GradeAnswers(qs, a.Answers)
	eff := EffectiveSubmitTime(*a, now)
	a.IsLate = IsLateSubmission(c, eff)
	a.PenaltyPercent = PenaltyFor(c, a.IsLate, a.PenaltyWaived)
	a.Points = ComputePoints(a.Correct, a.Total, a.PenaltyPercent)
	if st, ok := parseAttemptTime(a.StartedAt); ok {
		a.DurationSeconds = int(eff.Sub(st).Seconds())
		if a.DurationSeconds < 0 {
			a.DurationSeconds = 0
		}
	}
	// Submissions row = immutable result record (abandoned attempts record none).
	if status != domain.AttemptAbandoned {
		var missed []domain.SubmissionMissedQuestionDto
		for _, q := range qs {
			if sel, ok := a.Answers[q.ID]; !ok || sel != q.Answer {
				if !ok {
					sel = -1
				}
				missed = append(missed, domain.SubmissionMissedQuestionDto{ID: q.ID, SelectedAnswer: sel})
			}
		}
		sub := domain.Submission{
			ID: SubmissionID(a.ContestID, a.StudentID), ContestID: a.ContestID, StudentID: a.StudentID,
			Student: domain.StudentSub{ID: a.StudentID}, Score: float64(a.Correct),
			MissedQuestions: missed, SubmissionTime: eff, TimeSpend: fmt.Sprint(a.DurationSeconds),
			Scope: a.Scope, AttemptID: a.ID, StartedAt: a.StartedAt, IsLate: a.IsLate,
			PenaltyPercent: a.PenaltyPercent, Points: a.Points, DurationSeconds: a.DurationSeconds,
		}
		if st, err := u.students.GetStudentByID(a.StudentID); err == nil && st != nil {
			sub.Student = domain.StudentSub{ID: st.ID, Name: st.Name, ImgURL: st.ImgURL}
		}
		if id, err := u.submissions.AddSubmission(sub); err == nil {
			a.SubmissionID = id
			if u.OnSubmission != nil {
				if herr := u.OnSubmission(sub); herr != nil {
					log.Printf("attempt %s: badge evaluation: %v", a.ID, herr)
				}
			}
		} else {
			log.Printf("attempt %s: submission write failed: %v", a.ID, err)
		}
	}
	if err := u.attempts.Finalise(*a); err != nil {
		if err == ErrAttemptFinalised {
			cur, gerr := u.attempts.Get(a.ID)
			if gerr == nil && cur != nil {
				return cur, nil
			}
		}
		return nil, err
	}
	return a, nil
}

// ResultView is GET /attempts/:id/result: score always, answers only if visible.
type ResultView struct {
	Attempt        domain.Attempt     `json:"attempt"`
	AnswersVisible bool               `json:"answers_visible"`
	RevealAt       string             `json:"reveal_at,omitempty"`
	Editorial      []domain.Editorial `json:"editorial,omitempty"`
	ServerNow      string             `json:"server_now"`
}

func (u *AttemptUsecase) Result(attemptID, studentID string) (*ResultView, error) {
	a, err := u.ownedAttempt(attemptID, studentID)
	if err != nil {
		return nil, err
	}
	c, err := u.contests.GetContestByID(a.ContestID)
	if err != nil || c == nil {
		return nil, ErrAssessmentNotFound
	}
	a, err = u.lazyFinalise(*c, a)
	if err != nil {
		return nil, err
	}
	now := u.now()
	view := &ResultView{Attempt: *a, ServerNow: now.Format(time.RFC3339)}
	view.Attempt.Answers = nil // draft answers are only exposed through the editorial
	if !a.Finalised() {
		return view, nil
	}
	view.AnswersVisible = AnswersVisible(*c, *a, now)
	if c.EffectiveReveal() == domain.RevealAtEnd {
		view.RevealAt = c.EndTime
	}
	if view.AnswersVisible {
		qs, err := u.loadQuestions(c.Questions)
		if err != nil {
			return nil, err
		}
		for _, q := range ordered(qs, a.Order) {
			sel := a.Answers[q.ID]
			view.Editorial = append(view.Editorial, domain.Editorial{Question: q, UserAnswer: sel, IsCorrect: sel > 0 && sel == q.Answer})
		}
	}
	return view, nil
}

// SweepExpired finalises in_progress attempts that ran past expires_at + grace.
func (u *AttemptUsecase) SweepExpired() int {
	cutoff := u.now().Add(-AttemptGrace).Format(time.RFC3339)
	list, err := u.attempts.ListExpired(cutoff)
	if err != nil {
		log.Printf("attempt sweeper: %v", err)
		return 0
	}
	n := 0
	for i := range list {
		a := list[i]
		c, err := u.contests.GetContestByID(a.ContestID)
		if err != nil || c == nil {
			continue
		}
		if _, err := u.finalise(*c, &a, domain.AttemptAutoSubmitted, u.now()); err == nil {
			n++
		}
	}
	return n
}

// RunSweeper runs SweepExpired every interval until stop is closed.
func (u *AttemptUsecase) RunSweeper(interval time.Duration, stop <-chan struct{}) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-stop:
			return
		case <-t.C:
			if n := u.SweepExpired(); n > 0 {
				log.Printf("attempt sweeper: finalised %d attempt(s)", n)
			}
		}
	}
}

// AttemptCounts returns the number of recorded attempts per contest id.
func (u *AttemptUsecase) AttemptCounts() (map[string]int, error) { return u.attempts.CountsByContest() }

// AdminAttempts lists attempts for an assessment, optionally filtered by label.
// The result is always a slice: the admin table maps over it, so a no-match
// filter must read as "[]" rather than "null".
func (u *AttemptUsecase) AdminAttempts(contestID, label string) ([]domain.Attempt, error) {
	list, err := u.attempts.ListByContest(contestID)
	if err != nil {
		return nil, err
	}
	out := []domain.Attempt{}
	for _, a := range list {
		if label == "" || a.Label() == label {
			out = append(out, a)
		}
	}
	return out, nil
}

func (u *AttemptUsecase) AdminGet(id string) (*domain.Attempt, error) {
	a, err := u.attempts.Get(id)
	if err == nil && a == nil {
		return nil, ErrAttemptNotFound
	}
	return a, err
}

// AdminAction: exclude | waive_penalty | regrade | reset (plan §5.4.3).
func (u *AttemptUsecase) AdminAction(id, action, reason string) (*domain.Attempt, error) {
	a, err := u.AdminGet(id)
	if err != nil {
		return nil, err
	}
	switch action {
	case "exclude":
		if reason == "" {
			return nil, fmt.Errorf("%w: reason is required to exclude an attempt", ErrInvalidAction)
		}
		a.Excluded, a.ExcludedReason = true, reason
	case "waive_penalty":
		a.PenaltyWaived = true
	case "regrade":
		// handled below
	case "reset":
		if reason == "" {
			return nil, fmt.Errorf("%w: reason is required to reset an attempt", ErrInvalidAction)
		}
		log.Printf("AUDIT attempt reset id=%s student=%s reason=%q", a.ID, a.StudentID, reason)
		if a.SubmissionID != "" {
			if d, ok := u.submissions.(interface{ DeleteSubmission(string) error }); ok {
				_ = d.DeleteSubmission(a.SubmissionID)
			}
		}
		return a, u.attempts.Delete(a.ID)
	default:
		return nil, fmt.Errorf("%w: unknown action %q", ErrInvalidAction, action)
	}
	if action == "waive_penalty" || action == "regrade" {
		c, err := u.contests.GetContestByID(a.ContestID)
		if err != nil || c == nil {
			return nil, ErrAssessmentNotFound
		}
		qs, err := u.loadQuestions(c.Questions)
		if err != nil {
			return nil, err
		}
		a.Correct, a.Total = GradeAnswers(qs, a.Answers)
		a.PenaltyPercent = PenaltyFor(*c, a.IsLate, a.PenaltyWaived)
		a.Points = ComputePoints(a.Correct, a.Total, a.PenaltyPercent)
	}
	return a, u.attempts.Put(*a)
}

// ErrNotPhase2 means the contest is a legacy row (empty mode); callers fall
// back to the old submission path.
var ErrNotPhase2 = fmt.Errorf("not a phase 2 assessment")

// SubmitHook runs after a submission row is written (badge evaluation).
type SubmitHook func(domain.Submission) error

// SubmitLegacy routes POST /api/submission/ through the attempt engine for
// Phase 2 contests: it creates a completed attempt, applies the window check,
// ignores client time_spend, and grades server-side (plan §5.4.3 bridge).
func (u *AttemptUsecase) SubmitLegacy(dto domain.SubmissionDto) (string, float64, error) {
	c, err := u.contests.GetContestByID(dto.ContestID)
	if err != nil {
		return "", 0, err
	}
	if c == nil {
		return "", 0, ErrContestNotFound
	}
	if c.Mode == "" {
		return "", 0, ErrNotPhase2
	}
	sid := dto.Student.ID
	if sid == "" {
		return "", 0, ErrNoStudentID
	}
	if len(c.Questions) == 0 {
		return "", 0, ErrContestHasNoQuestions
	}
	now := u.now()
	if ex, _ := u.attempts.Get(domain.AttemptID(c.ID, sid)); ex != nil {
		return "", 0, ErrAlreadySubmitted
	}
	if err := CheckStartWindow(*c, now); err != nil {
		return "", 0, err
	}
	qs, err := u.loadQuestions(c.Questions)
	if err != nil {
		return "", 0, err
	}
	answers := map[string]int{}
	if len(dto.Answers) > 0 {
		for _, a := range dto.Answers {
			answers[a.ID] = a.SelectedAnswer
		}
	} else {
		missed := map[string]int{}
		for _, m := range dto.MissedQuestions {
			missed[m.ID] = m.SelectedAnswer
		}
		for _, q := range qs {
			if sel, bad := missed[q.ID]; bad {
				answers[q.ID] = sel
			} else {
				answers[q.ID] = q.Answer
			}
		}
	}
	a := domain.Attempt{
		ID: domain.AttemptID(c.ID, sid), ContestID: c.ID, StudentID: sid, Scope: c.Scope,
		Mode: c.EffectiveMode(), Status: domain.AttemptInProgress,
		StartedAt: now.Format(time.RFC3339), ExpiresAt: ComputeExpiresAt(*c, now).Format(time.RFC3339),
		Answers: answers, Total: len(qs),
	}
	if err := u.attempts.Create(a); err != nil {
		if err == ErrAlreadyAttempted {
			return "", 0, ErrAlreadySubmitted
		}
		return "", 0, err
	}
	res, err := u.finalise(*c, &a, domain.AttemptSubmitted, now)
	if err != nil {
		return "", 0, err
	}
	return res.SubmissionID, float64(res.Correct), nil
}
