package usecase

import (
	"sort"
	"testing"
	"time"

	"victory-contest-go/internal/domain"
)

// memBoards is an in-memory LeaderboardRepository mirroring the GSI ordering (rank_key desc).
type memBoards struct{ rows map[string]domain.BoardRow }

func newMemBoards() *memBoards { return &memBoards{rows: map[string]domain.BoardRow{}} }

func (m *memBoards) PutRows(rows []domain.BoardRow) error {
	for _, r := range rows {
		m.rows[r.ID] = r
	}
	return nil
}
func (m *memBoards) DeleteRow(id string) error { delete(m.rows, id); return nil }
func (m *memBoards) Top(key string, n int) ([]domain.BoardRow, error) {
	var out []domain.BoardRow
	for _, r := range m.rows {
		if r.BoardKey == key {
			out = append(out, r)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].RankKey > out[j].RankKey })
	if len(out) > n {
		out = out[:n]
	}
	return out, nil
}
func (m *memBoards) Get(key, sid string) (*domain.BoardRow, error) {
	r, ok := m.rows[key+"#"+sid]
	if !ok {
		return nil, nil
	}
	return &r, nil
}
func (m *memBoards) CountAbove(key string, rk int64) (int, error) {
	n := 0
	for _, r := range m.rows {
		if r.BoardKey == key && r.RankKey > rk {
			n++
		}
	}
	return n, nil
}

type memStudents map[string]*domain.Student

func (m memStudents) GetStudentByID(id string) (*domain.Student, error) { return m[id], nil }

func lbAttempt(id, student, contest string, points int, late bool, stream string, at time.Time) domain.Attempt {
	return domain.Attempt{
		ID: id, StudentID: student, ContestID: contest, Status: domain.AttemptSubmitted,
		Scope:           &domain.Scope{ProgramID: "grade-12", StreamID: domain.StreamCommon},
		StudentStreamID: stream, Points: points, Correct: points / 10, Total: 10, DurationSeconds: 600,
		IsLate: late, SubmittedAt: at.UTC().Format(time.RFC3339),
	}
}

func newLB(t *testing.T) (*LeaderboardUsecase, *memBoards, *fakeAttempts, time.Time) {
	t.Helper()
	now := time.Date(2026, 10, 13, 9, 0, 0, 0, time.UTC)
	boards, attempts := newMemBoards(), newFakeAttempts()
	students := memStudents{
		"s1": {Name: "Almaz", PrimaryProgramID: "grade-12", Enrollments: []domain.Enrollment{{ProgramID: "grade-12", StreamID: "natural-science"}}},
	}
	u := NewLeaderboardUsecase(boards, attempts, students)
	u.now = func() time.Time { return now }
	return u, boards, attempts, now
}

func TestRecordCommonAssessmentUsesStudentStream(t *testing.T) {
	u, boards, attempts, now := newLB(t)
	a := lbAttempt("a1", "s1", "c1", 80, true, "natural-science", now)
	attempts.rows[a.ID] = a
	u.Record(a)

	prog := domain.BoardKey(domain.PeriodDay, now, "grade-12", "")
	stream := domain.BoardKey(domain.PeriodDay, now, "grade-12", "natural-science")
	for _, k := range []string{prog, stream, domain.ContestBoardKey("c1")} {
		if r, _ := boards.Get(k, "s1"); r == nil || r.Points != 80 {
			t.Fatalf("row %s missing or wrong: %+v", k, r)
		}
	}
	if r, _ := boards.Get(prog, "s1"); r.LateCount != 1 || r.TTL == 0 {
		t.Fatalf("day row must be late-flagged with a ttl: %+v", r)
	}
	if r, _ := boards.Get(domain.BoardKey(domain.PeriodAll, now, "grade-12", ""), "s1"); r.TTL != 0 {
		t.Fatalf("all-time row must not expire: %+v", r)
	}
	if r, _ := boards.Get(domain.BoardKey(domain.PeriodMonth, now, "grade-12", ""), "s1"); r.TTL != 0 {
		t.Fatalf("month row must not expire: %+v", r)
	}
}

func TestRecordIsIdempotentAndSumsPeriod(t *testing.T) {
	u, boards, attempts, now := newLB(t)
	a1 := lbAttempt("a1", "s1", "c1", 80, false, "natural-science", now)
	a2 := lbAttempt("a2", "s1", "c2", 60, false, "natural-science", now.Add(time.Hour))
	attempts.rows[a1.ID], attempts.rows[a2.ID] = a1, a2
	u.Record(a2)
	u.Record(a2)
	if r, _ := boards.Get(domain.BoardKey(domain.PeriodWeek, now, "grade-12", ""), "s1"); r.Points != 140 || r.Attempts != 2 {
		t.Fatalf("week row should sum both attempts once: %+v", r)
	}
}

func TestExclusionRemovesStaleRows(t *testing.T) {
	u, boards, attempts, now := newLB(t)
	a := lbAttempt("a1", "s1", "c1", 80, false, "natural-science", now)
	attempts.rows[a.ID] = a
	u.Record(a)
	gone := a
	gone.Excluded = true
	attempts.rows[a.ID] = gone
	u.Record(gone)
	for _, k := range []string{domain.BoardKey(domain.PeriodDay, now, "grade-12", ""), domain.ContestBoardKey("c1")} {
		if r, _ := boards.Get(k, "s1"); r != nil {
			t.Fatalf("stale row left on %s: %+v", k, r)
		}
	}
}

func TestBoardVisibilityAndMyRankBeyondTop(t *testing.T) {
	u, boards, _, now := newLB(t)
	if _, err := u.Board("s1", "week", "grade-12", "social-science"); err != ErrBoardForbidden {
		t.Fatalf("other stream must be refused, got %v", err)
	}
	if _, err := u.Board("s1", "week", "freshman", ""); err != ErrBoardForbidden {
		t.Fatalf("unenrolled program must be refused, got %v", err)
	}
	if _, err := u.Board("s1", "year", "", ""); err != ErrBadPeriod {
		t.Fatalf("bad period, got %v", err)
	}
	key := domain.BoardKey(domain.PeriodWeek, now, "grade-12", "")
	for i := 0; i < 120; i++ { // 120 rivals above the caller
		id := key + "#r" + string(rune('A'+i%26)) + string(rune('a'+i/26))
		boards.rows[id] = domain.BoardRow{ID: id, BoardKey: key, StudentID: id, Points: 500 + i, RankKey: domain.RankKey(500+i, 100)}
	}
	boards.rows[key+"#s1"] = domain.BoardRow{ID: key + "#s1", BoardKey: key, StudentID: "s1", Points: 100, Attempts: 1, RankKey: domain.RankKey(100, 600)}
	v, err := u.Board("s1", "week", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(v.Entries) != 100 {
		t.Fatalf("top list must be capped at 100, got %d", len(v.Entries))
	}
	if v.Me == nil || v.Me.Rank != 121 {
		t.Fatalf("my rank beyond the top 100 should be 121, got %+v", v.Me)
	}
}
