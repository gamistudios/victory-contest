package usecase

import (
	"fmt"
	"time"

	"victory-contest-go/internal/domain"
)

// PeriodContest labels the per-assessment board. It is not one of the four time
// periods and its rows never expire.
const PeriodContest = "contest"

// LegacyBoardRow is one historical submission reduced to what a board needs.
// The numbers come from the submission itself (score, answer sheet, time spent)
// plus the scope resolved from its contest, so a round whose question rows are
// gone still gets its leaderboard back.
type LegacyBoardRow struct {
	SubmissionID string
	ContestID    string
	StudentID    string
	ProgramID    string
	StreamID     string // empty = only the program-wide board
	Points       int
	Correct      int
	Total        int
	Seconds      int
	At           time.Time
	Name         string
	AvatarURL    string
	Region       string
}

// ReplayReport is what the dry run prints.
type ReplayReport struct {
	Submissions    int
	Students       int
	SkippedNoScope int
	Rows           int
	Written        bool
	PerPeriod      map[string]int
}

func (r ReplayReport) String() string {
	written := "dry run"
	if r.Written {
		written = "written"
	}
	return fmt.Sprintf("submissions=%d students=%d rows=%d (%s) skipped-no-scope=%d per-period=%v",
		r.Submissions, r.Students, r.Rows, written, r.SkippedNoScope, r.PerPeriod)
}

// legacyCell is one student's standing on one board. Cells are keyed by the
// board row id ({board key}#{student}) because a board holds every student of
// its program.
type legacyCell struct {
	board  domain.BoardRow
	period string
	best   bool // contest board: keep the best submission instead of summing
}

func (c *legacyCell) add(a *LegacyBoardRow) {
	if c.best {
		if domain.RankKey(c.board.Points, c.board.Seconds) >= domain.RankKey(a.Points, a.Seconds) {
			return
		}
		c.board.Points, c.board.Correct = a.Points, a.Correct
		c.board.Total, c.board.Seconds = a.Total, a.Seconds
		c.board.Name, c.board.AvatarURL, c.board.Region = a.Name, a.AvatarURL, a.Region
		c.board.RankKey = domain.RankKey(a.Points, a.Seconds)
		return
	}
	c.board.Attempts++
	c.board.Points += a.Points
	c.board.Correct += a.Correct
	c.board.Total += a.Total
	c.board.Seconds += a.Seconds
	c.board.RankKey = domain.RankKey(c.board.Points, c.board.Seconds)
}

// ReplayLegacy rebuilds the precomputed boards from historical submissions
// (plan §5.5). Unlike Record it aggregates the rows it is handed rather than
// rereading the attempts table, because the legacy rounds exist only as
// submissions. Points and the time tie-break follow the old contest ranking
// rules (GetRankingsForContest), so a migrated board orders students the way the
// board they saw did. Idempotent: keys are deterministic and rows are put, never
// incremented. With apply=false the report is computed and nothing is written.
func (u *LeaderboardUsecase) ReplayLegacy(rows []LegacyBoardRow, apply bool) (ReplayReport, error) {
	report := ReplayReport{Submissions: len(rows), PerPeriod: map[string]int{}}
	now := u.now()
	cells := map[string]*legacyCell{}
	students := map[string]bool{}

	put := func(cells map[string]*legacyCell, boardKey, period string, best bool, a *LegacyBoardRow) {
		id := boardKey + "#" + a.StudentID
		c := cells[id]
		if c == nil {
			c = &legacyCell{period: period, best: best, board: domain.BoardRow{
				ID: id, BoardKey: boardKey, StudentID: a.StudentID,
				Name: a.Name, AvatarURL: a.AvatarURL, Region: a.Region, Attempts: 0,
			}}
			cells[id] = c
		}
		c.add(a)
	}

	for i := range rows {
		a := rows[i]
		if a.ProgramID == "" {
			report.SkippedNoScope++
			continue
		}
		students[a.StudentID] = true
		for _, p := range domain.Periods {
			put(cells, domain.BoardKey(p, a.At, a.ProgramID, ""), p, false, &a)
			if a.StreamID != "" {
				put(cells, domain.BoardKey(p, a.At, a.ProgramID, a.StreamID), p, false, &a)
			}
		}
		if a.ContestID != "" {
			put(cells, domain.ContestBoardKey(a.ContestID), PeriodContest, true, &a)
		}
	}

	out := make([]domain.BoardRow, 0, len(cells))
	for _, c := range cells {
		row := c.board
		if row.Attempts == 0 {
			row.Attempts = 1 // a contest cell counts its single best submission
		}
		if !c.best {
			row.TTL = domain.BoardTTL(c.period, now)
		}
		out = append(out, row)
		report.PerPeriod[c.period]++
	}

	report.Students = len(students)
	report.Rows = len(out)
	report.Written = apply && len(out) > 0
	if !apply || len(out) == 0 {
		return report, nil
	}
	return report, u.repo.PutRows(out)
}
