package usecase

import (
	"testing"
	"time"

	"victory-contest-go/internal/domain"
)

func legacyRow(id, student, contest string, points, seconds int, at time.Time, program, stream string) LegacyBoardRow {
	return LegacyBoardRow{
		SubmissionID: id, ContestID: contest, StudentID: student,
		ProgramID: program, StreamID: stream,
		Points: points, Correct: points, Total: 20, Seconds: seconds, At: at,
		Name: "name-" + student, AvatarURL: "img-" + student, Region: "Addis",
	}
}

func TestReplayLegacyWritesEveryBoardTheSubmissionTouched(t *testing.T) {
	u, boards, _, now := newLB(t)
	older := now.Add(-48 * time.Hour) // two days back: different day key, earlier ISO week
	if _, err := u.ReplayLegacy([]LegacyBoardRow{
		legacyRow("sub1", "s1", "c1", 15, 600, older, "grade-12", "natural-science"),
		legacyRow("sub2", "s1", "c2", 10, 300, now, "grade-12", "natural-science"),
	}, true); err != nil {
		t.Fatal(err)
	}

	all := domain.BoardKey(domain.PeriodAll, now, "grade-12", "")
	if r, _ := boards.Get(all, "s1"); r == nil || r.Points != 25 || r.Attempts != 2 || r.Total != 40 || r.Name != "name-s1" {
		t.Fatalf("all-time board = %+v", r)
	}
	stream := domain.BoardKey(domain.PeriodAll, now, "grade-12", "natural-science")
	if r, _ := boards.Get(stream, "s1"); r == nil || r.Points != 25 {
		t.Fatalf("stream board = %+v", r)
	}
	// Each historical day and week keeps its own summed row.
	for _, tc := range []struct {
		at     time.Time
		points int
	}{
		{older, 15}, {now, 10},
	} {
		if r, _ := boards.Get(domain.BoardKey(domain.PeriodDay, tc.at, "grade-12", ""), "s1"); r == nil || r.Points != tc.points {
			t.Fatalf("day board for %v = %+v, want %d", tc.at, r, tc.points)
		}
		if r, _ := boards.Get(domain.BoardKey(domain.PeriodWeek, tc.at, "grade-12", ""), "s1"); r == nil || r.Points != tc.points {
			t.Fatalf("week board for %v = %+v", tc.at, r)
		}
	}
	// Both submissions fall in the same month, so the month board sums them.
	if r, _ := boards.Get(domain.BoardKey(domain.PeriodMonth, now, "grade-12", ""), "s1"); r == nil || r.Points != 25 {
		t.Fatalf("month board = %+v", r)
	}
	// Day and week rows expire; month, all-time and contest rows do not.
	if r, _ := boards.Get(domain.BoardKey(domain.PeriodDay, now, "grade-12", ""), "s1"); r == nil || r.TTL == 0 {
		t.Fatalf("day row must carry a ttl: %+v", r)
	}
	for _, k := range []string{domain.BoardKey(domain.PeriodMonth, now, "grade-12", ""), all} {
		if r, _ := boards.Get(k, "s1"); r == nil || r.TTL != 0 {
			t.Fatalf("%s row must not expire: %+v", k, r)
		}
	}
	if r, _ := boards.Get(domain.ContestBoardKey("c1"), "s1"); r == nil || r.Points != 15 || r.Attempts != 1 || r.TTL != 0 {
		t.Fatalf("contest board row = %+v", r)
	}
}

func TestReplayLegacyContestBoardKeepsBestSubmission(t *testing.T) {
	u, boards, _, now := newLB(t)
	rows := []LegacyBoardRow{
		legacyRow("sub1", "s1", "c1", 18, 900, now, "grade-12", ""),
		legacyRow("sub2", "s1", "c1", 15, 300, now, "grade-12", ""),
		legacyRow("sub3", "s1", "c1", 20, 1200, now, "grade-12", ""),
	}
	if _, err := u.ReplayLegacy(rows, true); err != nil {
		t.Fatal(err)
	}
	r, _ := boards.Get(domain.ContestBoardKey("c1"), "s1")
	if r == nil || r.Points != 20 || r.Total != 20 || r.Attempts != 1 {
		t.Fatalf("best submission must win the contest board, got %+v", r)
	}
	// The time boards still count all three rounds.
	if p, _ := boards.Get(domain.BoardKey(domain.PeriodAll, now, "grade-12", ""), "s1"); p == nil || p.Points != 53 || p.Attempts != 3 {
		t.Fatalf("all-time board = %+v", p)
	}
}

func TestReplayLegacyRanksTiesOnTimeAndSkipsUnscoped(t *testing.T) {
	u, boards, _, now := newLB(t)
	rep, err := u.ReplayLegacy([]LegacyBoardRow{
		legacyRow("sub1", "slow", "c1", 15, 1200, now, "grade-12", ""),
		legacyRow("sub2", "fast", "c1", 15, 300, now, "grade-12", ""),
		legacyRow("sub3", "nobody", "c1", 20, 600, now, "", ""),
	}, true)
	if err != nil {
		t.Fatal(err)
	}
	if rep.SkippedNoScope != 1 || rep.Students != 2 {
		t.Fatalf("report = %+v", rep)
	}
	top, _ := boards.Top(domain.BoardKey(domain.PeriodAll, now, "grade-12", ""), 10)
	if len(top) != 2 || top[0].StudentID != "fast" {
		t.Fatalf("equal points must rank the faster submission first: %+v", top)
	}
	if r, _ := boards.Get(domain.BoardKey(domain.PeriodAll, now, "", ""), "nobody"); r != nil {
		t.Fatal("an unscoped submission must not create a board row")
	}
	// No stream on the row means only the program-wide board exists.
	if r, _ := boards.Get(domain.BoardKey(domain.PeriodAll, now, "grade-12", "natural-science"), "fast"); r != nil {
		t.Fatal("streamless submission must not feed a stream board")
	}
}

func TestReplayLegacyDryRunWritesNothingAndReplayIsIdempotent(t *testing.T) {
	u, boards, _, now := newLB(t)
	row := legacyRow("sub1", "s1", "c1", 10, 60, now, "grade-12", "")
	rep, err := u.ReplayLegacy([]LegacyBoardRow{row}, false)
	if err != nil {
		t.Fatal(err)
	}
	if rep.Rows == 0 || rep.Written || len(boards.rows) != 0 {
		t.Fatalf("dry run wrote rows: report=%+v rows=%d", rep, len(boards.rows))
	}
	// Applying the same submissions twice reuses the same row ids: the boards are
	// recomputed, never incremented.
	if _, err := u.ReplayLegacy([]LegacyBoardRow{row, row}, true); err != nil {
		t.Fatal(err)
	}
	before := len(boards.rows)
	if _, err := u.ReplayLegacy([]LegacyBoardRow{row}, true); err != nil {
		t.Fatal(err)
	}
	if len(boards.rows) != before {
		t.Fatalf("replay created new rows: %d -> %d", before, len(boards.rows))
	}
	all, _ := boards.Get(domain.BoardKey(domain.PeriodAll, now, "grade-12", ""), "s1")
	if all == nil || all.Points != 10 || all.Attempts != 1 {
		t.Fatalf("replayed board must hold the replayed numbers, not a second sum: %+v", all)
	}
}
