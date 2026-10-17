package usecase

import (
	"errors"
	"log"
	"time"

	"victory-contest-go/internal/domain"
)

// LeaderboardRepository is the storage the boards need.
type LeaderboardRepository interface {
	PutRows(rows []domain.BoardRow) error
	DeleteRow(id string) error
	Top(boardKey string, n int) ([]domain.BoardRow, error)
	Get(boardKey, studentID string) (*domain.BoardRow, error)
	CountAbove(boardKey string, rankKey int64) (int, error)
}

var (
	ErrBoardForbidden = errors.New("board not available to this student")
	ErrBadPeriod      = errors.New("invalid period")
)

const boardTop = 100

type LeaderboardUsecase struct {
	repo     LeaderboardRepository
	attempts AttemptRepository
	students interface {
		GetStudentByID(id string) (*domain.Student, error)
	}
	now func() time.Time
}

func NewLeaderboardUsecase(repo LeaderboardRepository, attempts AttemptRepository, students interface {
	GetStudentByID(id string) (*domain.Student, error)
}) *LeaderboardUsecase {
	return &LeaderboardUsecase{repo: repo, attempts: attempts, students: students, now: time.Now}
}

type boardAgg struct{ points, attempts, correct, total, seconds, late int }

// streamOf is the board stream of an attempt: its own stream, or the student's for common assessments.
func streamOf(a domain.Attempt) string {
	if a.Scope == nil {
		return ""
	}
	if a.Scope.StreamID != "" && a.Scope.StreamID != domain.StreamCommon {
		return a.Scope.StreamID
	}
	if a.StudentStreamID != domain.StreamCommon {
		return a.StudentStreamID
	}
	return ""
}

func effectiveTime(a domain.Attempt) (time.Time, bool) {
	t, ok := parseAttemptTime(a.SubmittedAt)
	return t, ok
}

// Record recomputes the student's rows for the attempt's program from all their finalised attempts
// (recompute-and-put: idempotent, survives exclusions and waived penalties). Never fails a submit.
func (u *LeaderboardUsecase) Record(a domain.Attempt) {
	if err := u.record(a); err != nil {
		log.Printf("leaderboard: record %s: %v", a.ID, err)
	}
}

func (u *LeaderboardUsecase) record(a domain.Attempt) error {
	if a.Scope == nil || a.Scope.ProgramID == "" {
		return nil
	}
	program := a.Scope.ProgramID
	all, err := u.attempts.ListByStudent(a.StudentID)
	if err != nil {
		return err
	}
	aggs := map[string]*boardAgg{}
	add := func(key string, at domain.Attempt) {
		g := aggs[key]
		if g == nil {
			g = &boardAgg{}
			aggs[key] = g
		}
		g.points += at.Points
		g.attempts++
		g.correct += at.Correct
		g.total += at.Total
		g.seconds += at.DurationSeconds
		if at.IsLate && !at.PenaltyWaived {
			g.late++
		}
	}
	now := u.now()
	// Boards this recompute must cover: the periods of the triggering attempt, plus every other
	// period key touched by the student's attempts in this program.
	targets := map[string]string{} // board key -> period
	for _, at := range all {
		if !at.Finalised() || at.Excluded || at.Status == domain.AttemptAbandoned || at.Scope == nil || at.Scope.ProgramID != program {
			continue
		}
		t, ok := effectiveTime(at)
		if !ok {
			continue
		}
		stream := streamOf(at)
		for _, p := range domain.Periods {
			add(domain.BoardKey(p, t, program, ""), at)
			targets[domain.BoardKey(p, t, program, "")] = p
			if stream != "" {
				add(domain.BoardKey(p, t, program, stream), at)
				targets[domain.BoardKey(p, t, program, stream)] = p
			}
		}
	}
	// Boards the triggering attempt fed but that no remaining attempt touches (exclusion, reset,
	// delete of the only attempt in a period): delete this student's row so no stale points stay.
	if t, ok := effectiveTime(a); ok {
		stream := streamOf(a)
		for _, p := range domain.Periods {
			keys := []string{domain.BoardKey(p, t, program, "")}
			if stream != "" {
				keys = append(keys, domain.BoardKey(p, t, program, stream))
			}
			for _, k := range keys {
				if _, ok := aggs[k]; !ok {
					_ = u.repo.DeleteRow(k + "#" + a.StudentID)
				}
			}
		}
	}
	name, avatar, region := "", "", ""
	if st, err := u.students.GetStudentByID(a.StudentID); err == nil && st != nil {
		name, avatar, region = st.Name, st.ImgURL, st.Region
	}
	var rows []domain.BoardRow
	for key, g := range aggs {
		rows = append(rows, domain.BoardRow{
			ID: key + "#" + a.StudentID, BoardKey: key, StudentID: a.StudentID, Name: name, AvatarURL: avatar, Region: region,
			Points: g.points, Attempts: g.attempts, Correct: g.correct, Total: g.total, Seconds: g.seconds, LateCount: g.late,
			RankKey: domain.RankKey(g.points, g.seconds), TTL: domain.BoardTTL(targets[key], now),
		})
	}
	// The assessment's own board.
	if !a.Excluded && a.Status != domain.AttemptAbandoned {
		ck := domain.ContestBoardKey(a.ContestID)
		late := 0
		if a.IsLate {
			late = 1
		}
		rows = append(rows, domain.BoardRow{
			ID: ck + "#" + a.StudentID, BoardKey: ck, StudentID: a.StudentID, Name: name, AvatarURL: avatar, Region: region,
			Points: a.Points, Attempts: 1, Correct: a.Correct, Total: a.Total, Seconds: a.DurationSeconds, LateCount: late,
			RankKey: domain.RankKey(a.Points, a.DurationSeconds),
		})
	} else {
		_ = u.repo.DeleteRow(domain.ContestBoardKey(a.ContestID) + "#" + a.StudentID)
	}
	if len(rows) == 0 {
		return nil
	}
	return u.repo.PutRows(rows)
}

// BoardView is the API answer: top rows plus the caller's own rank.
type BoardView struct {
	Period    string               `json:"period"`
	ProgramID string               `json:"program_id"`
	StreamID  string               `json:"stream_id,omitempty"`
	Key       string               `json:"board_key"`
	Entries   []domain.BoardEntry  `json:"entries"`
	Me        *domain.BoardEntry   `json:"me,omitempty"`
}

func toEntry(r domain.BoardRow, rank int) domain.BoardEntry {
	avg := 0
	if r.Total > 0 {
		avg = int(float64(r.Correct)/float64(r.Total)*100 + 0.5)
	}
	return domain.BoardEntry{Rank: rank, StudentID: r.StudentID, Name: r.Name, AvatarURL: r.AvatarURL, Region: r.Region,
		Points: r.Points, Attempts: r.Attempts, AvgPercent: avg, Seconds: r.Seconds, Late: r.LateCount > 0}
}

// Board serves GET /api/leaderboard. Programs the student is not enrolled in, and streams other than
// their own for that program, are refused.
func (u *LeaderboardUsecase) Board(studentID, period, program, stream string) (*BoardView, error) {
	if period == "" {
		period = domain.PeriodWeek
	}
	valid := false
	for _, p := range domain.Periods {
		valid = valid || p == period
	}
	if !valid {
		return nil, ErrBadPeriod
	}
	st, err := u.students.GetStudentByID(studentID)
	if err != nil || st == nil {
		return nil, ErrBoardForbidden
	}
	if program == "" {
		program = st.PrimaryProgramID
	}
	var enrol *domain.Enrollment
	for i := range st.Enrollments {
		if st.Enrollments[i].ProgramID == program {
			enrol = &st.Enrollments[i]
		}
	}
	if enrol == nil {
		return nil, ErrBoardForbidden
	}
	if stream == domain.StreamCommon {
		stream = ""
	}
	if stream != "" && stream != enrol.StreamID {
		return nil, ErrBoardForbidden
	}
	key := domain.BoardKey(period, u.now(), program, stream)
	return u.view(key, period, program, stream, studentID)
}

func (u *LeaderboardUsecase) view(key, period, program, stream, studentID string) (*BoardView, error) {
	rows, err := u.repo.Top(key, boardTop)
	if err != nil {
		return nil, err
	}
	v := &BoardView{Period: period, ProgramID: program, StreamID: stream, Key: key, Entries: []domain.BoardEntry{}}
	for i, r := range rows {
		e := toEntry(r, i+1)
		v.Entries = append(v.Entries, e)
		if r.StudentID == studentID {
			me := e
			v.Me = &me
		}
	}
	if v.Me == nil {
		if mine, err := u.repo.Get(key, studentID); err == nil && mine != nil {
			if above, err := u.repo.CountAbove(key, mine.RankKey); err == nil {
				me := toEntry(*mine, above+1)
				v.Me = &me
			}
		}
	}
	return v, nil
}

// ContestBoard is the per-assessment board (also used by admin, view-only).
func (u *LeaderboardUsecase) ContestBoard(contestID, studentID string) (*BoardView, error) {
	return u.view(domain.ContestBoardKey(contestID), "contest", "", "", studentID)
}

// BoardsForStudent lists the program boards the student may open.
func (u *LeaderboardUsecase) BoardsForStudent(studentID string) ([]domain.Enrollment, string, error) {
	st, err := u.students.GetStudentByID(studentID)
	if err != nil || st == nil {
		return nil, "", ErrBoardForbidden
	}
	return st.Enrollments, st.PrimaryProgramID, nil
}

// AdminBoard reads any board without the enrolment rule.
func (u *LeaderboardUsecase) AdminBoard(contestID, period, program, stream string) (*BoardView, error) {
	if contestID != "" {
		return u.ContestBoard(contestID, "")
	}
	if period == "" {
		period = domain.PeriodWeek
	}
	if program == "" {
		return nil, ErrBoardForbidden
	}
	if stream == domain.StreamCommon {
		stream = ""
	}
	return u.view(domain.BoardKey(period, u.now(), program, stream), period, program, stream, "")
}

// LegacyAll backs the old /submission/leaderboard alias: the caller's active-program, all-time
// board, shaped like the old entries (no scan).
func (u *LeaderboardUsecase) LegacyAll(studentID string) ([]domain.LeaderboardEntry, error) {
	v, err := u.Board(studentID, domain.PeriodAll, "", "")
	if err != nil {
		return nil, err
	}
	out := make([]domain.LeaderboardEntry, 0, len(v.Entries))
	for _, e := range v.Entries {
		out = append(out, domain.LeaderboardEntry{Rank: e.Rank, UserID: e.StudentID, UserName: e.Name, Score: e.Points,
			CorrectAnswers: 0, TotalQuestions: 0, ImageURL: e.AvatarURL, TimeTakenSeconds: e.Seconds})
	}
	return out, nil
}
