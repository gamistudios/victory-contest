package usecase

import (
	"errors"
	"log"
	"sort"
	"time"

	"victory-contest-go/internal/domain"
)

// LockedError is returned by AttemptUsecase.Access when premium access is
// missing; the handler turns it into 402 with the uniform lock object.
type LockedError struct{ Lock interface{} }

func (e *LockedError) Error() string { return "premium content" }

// AssessmentMeta is list/intro data: metadata only, never questions (plan §5.4.2).
type AssessmentMeta struct {
	ID                 string         `json:"id"`
	Title              string         `json:"title"`
	Description        string         `json:"description"`
	Kind               string         `json:"kind"`
	Mode               string         `json:"mode"`
	Access             string         `json:"access"`
	Scope              *domain.Scope  `json:"scope,omitempty"`
	StartTime          string         `json:"start_time"`
	EndTime            string         `json:"end_time"`
	DurationMinutes    int            `json:"duration_minutes"`
	LatePenaltyPercent int            `json:"late_penalty_percent"`
	Reveal             string         `json:"reveal"`
	QuestionCount      int            `json:"question_count"`
	Year               string         `json:"year,omitempty"`
	Source             string         `json:"source,omitempty"`
	Lock               interface{}    `json:"lock,omitempty"`
	MyAttempt          *MyAttemptInfo `json:"my_attempt,omitempty"`
	// Registered is the roster flag the legacy contest card gated joining on.
	// Only the single-assessment read fills it: the list never pays a read per row.
	Registered        bool   `json:"registered,omitempty"`
	NeedsRegistration bool   `json:"needs_registration"`
	ServerNow         string `json:"server_now"`
}

type MyAttemptInfo struct {
	ID        string `json:"id"`
	Status    string `json:"status"`
	ExpiresAt string `json:"expires_at"` // so the intro can count the resume down (plan §7.2)
	IsLate    bool   `json:"is_late"`
	Correct   int    `json:"correct"`
	Total     int    `json:"total"`
	Points    int    `json:"points"`
}

func (u *AttemptUsecase) meta(c domain.Contest, studentID string, mine map[string]domain.Attempt) AssessmentMeta {
	m := AssessmentMeta{
		ID: c.ID, Title: c.Title, Description: c.Description, Kind: c.EffectiveKind(), Mode: c.EffectiveMode(),
		Access: c.Type, Scope: c.Scope, StartTime: c.StartTime, EndTime: c.EndTime,
		DurationMinutes: c.DurationMinutes, LatePenaltyPercent: c.LatePenaltyPercent, Reveal: c.EffectiveReveal(),
		QuestionCount: len(c.Questions), Year: c.Year, Source: c.Source,
		NeedsRegistration: c.NeedsRegistration(), ServerNow: u.now().Format(time.RFC3339),
	}
	if u.Access != nil {
		var le *LockedError
		if err := u.Access(studentID, c); errors.As(err, &le) {
			m.Lock = le.Lock
		}
	}
	if a, ok := mine[c.ID]; ok {
		m.MyAttempt = &MyAttemptInfo{ID: a.ID, Status: a.Status, ExpiresAt: a.ExpiresAt, IsLate: a.IsLate, Correct: a.Correct, Total: a.Total, Points: a.Points}
	}
	return m
}

func (u *AttemptUsecase) myAttempts(studentID string) map[string]domain.Attempt {
	out := map[string]domain.Attempt{}
	list, err := u.attempts.ListByStudent(studentID)
	if err != nil {
		return out
	}
	for _, a := range list {
		out[a.ContestID] = a
	}
	return out
}

// ListAssessments lists contests visible to the scope filter, newest start first.
func (u *AttemptUsecase) ListAssessments(studentID string, f domain.ScopeFilter) ([]AssessmentMeta, error) {
	all, err := u.contests.GetAllContests()
	if err != nil {
		return nil, err
	}
	mine := u.myAttempts(studentID)
	out := []AssessmentMeta{}
	for _, c := range all {
		// No status filter: contests are created with status "inactive" by the
		// admin form's default and the legacy app derives open/ended from the
		// start/end times, never from status. Filtering here would hide real contests.
		if c.Scope != nil && !c.Scope.Matches(f) {
			continue
		}
		out = append(out, u.meta(c, studentID, mine))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].StartTime > out[j].StartTime })
	return out, nil
}

// GetAssessment returns intro-screen data for one assessment.
func (u *AttemptUsecase) GetAssessment(id, studentID string) (*AssessmentMeta, error) {
	c, err := u.contests.GetContestByID(id)
	if err != nil || c == nil {
		return nil, ErrAssessmentNotFound
	}
	m := u.meta(*c, studentID, u.myAttempts(studentID))
	if u.Roster != nil && c.NeedsRegistration() {
		registered, err := u.Roster.CheckRegistrationsByContestAndStudent(id, studentID)
		if err != nil {
			// A failed roster read reads as "not registered", and registering is
			// idempotent, so the student's next tap heals it.
			log.Printf("roster read for assessment %s student %s: %v", id, studentID, err)
		}
		m.Registered = registered
	}
	return &m, nil
}

// AssessmentEditorial is the answers-and-explanations read for a student who is
// NOT looking at their own result: the legacy editorial page served any student
// once a contest ended, and deleting that page must not take the rule with it.
type AssessmentEditorial struct {
	Title        string             `json:"title"`
	Visible      bool               `json:"visible"`
	Participated bool               `json:"participated"`
	Message      string             `json:"message,omitempty"`
	Editorial    []domain.Editorial `json:"editorial,omitempty"`
	ServerNow    string             `json:"server_now"`
}

func (u *AttemptUsecase) AssessmentEditorial(id, studentID string) (*AssessmentEditorial, error) {
	c, err := u.contests.GetContestByID(id)
	if err != nil || c == nil {
		return nil, ErrAssessmentNotFound
	}
	participated := false
	if a, err := u.attempts.Get(domain.AttemptID(id, studentID)); err == nil && a != nil {
		participated = a.Finalised()
	} else if err != nil {
		log.Printf("editorial participation read %s/%s: %v", id, studentID, err)
	}
	out := &AssessmentEditorial{Title: c.Title, Participated: participated, ServerNow: u.now().Format(time.RFC3339)}
	if len(c.Questions) == 0 {
		out.Message = "This assessment has no questions yet, so there is no editorial to show."
		return out, nil
	}
	if !EditorialVisible(*c, participated, u.now()) {
		out.Message = "The editorial unlocks once the assessment has ended — correct answers cannot be shown while it is still open."
		return out, nil
	}
	qs, err := u.loadQuestions(c.Questions)
	if err != nil {
		return nil, err
	}
	out.Visible = true
	out.Editorial = make([]domain.Editorial, 0, len(qs))
	for _, q := range qs {
		out.Editorial = append(out.Editorial, domain.Editorial{Question: q})
	}
	return out, nil
}

// LeaderboardRow ranks by points; ties break on duration (plan §5.5).
type LeaderboardRow struct {
	Rank            int    `json:"rank"`
	StudentID       string `json:"student_id"`
	Name            string `json:"name"`
	ImgURL          string `json:"imgurl"`
	Points          int    `json:"points"`
	Correct         int    `json:"correct"`
	Total           int    `json:"total"`
	IsLate          bool   `json:"is_late"`
	DurationSeconds int    `json:"duration_seconds"`
}

func (u *AttemptUsecase) Leaderboard(contestID string) ([]LeaderboardRow, error) {
	list, err := u.attempts.ListByContest(contestID)
	if err != nil {
		return nil, err
	}
	rows := []LeaderboardRow{}
	for _, a := range list {
		if !a.Finalised() || a.Excluded || a.Status == domain.AttemptAbandoned {
			continue
		}
		r := LeaderboardRow{StudentID: a.StudentID, Points: a.Points, Correct: a.Correct, Total: a.Total, IsLate: a.IsLate, DurationSeconds: a.DurationSeconds}
		if st, err := u.students.GetStudentByID(a.StudentID); err == nil && st != nil {
			r.Name, r.ImgURL = st.Name, st.ImgURL
		}
		rows = append(rows, r)
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Points != rows[j].Points {
			return rows[i].Points > rows[j].Points
		}
		return rows[i].DurationSeconds < rows[j].DurationSeconds
	})
	for i := range rows {
		rows[i].Rank = i + 1
	}
	return rows, nil
}
