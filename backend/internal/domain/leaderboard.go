package domain

import (
	"fmt"
	"time"
)

// Leaderboard periods (plan §5.5). Computed in Africa/Addis_Ababa, Gregorian, week starts Monday.
const (
	PeriodDay   = "day"
	PeriodWeek  = "week"
	PeriodMonth = "month"
	PeriodAll   = "all"
)

var Periods = []string{PeriodDay, PeriodWeek, PeriodMonth, PeriodAll}

// BoardRow is one student's aggregate on one board (table `leaderboard`).
type BoardRow struct {
	ID        string `json:"id"         dynamodbav:"id"` // {board_key}#{student_id}
	BoardKey  string `json:"board_key"  dynamodbav:"board_key"`
	StudentID string `json:"student_id" dynamodbav:"student_id"`
	Name      string `json:"name"       dynamodbav:"name"`
	AvatarURL string `json:"avatar_url,omitempty" dynamodbav:"avatar_url,omitempty"`
	Region    string `json:"region,omitempty"     dynamodbav:"region,omitempty"`
	Points    int    `json:"points"     dynamodbav:"points"`
	Attempts  int    `json:"attempts"   dynamodbav:"attempts"`
	Correct   int    `json:"correct"    dynamodbav:"correct"`
	Total     int    `json:"total"      dynamodbav:"total"`
	Seconds   int    `json:"seconds"    dynamodbav:"seconds"`
	LateCount int    `json:"late_count" dynamodbav:"late_count"`
	RankKey   int64  `json:"-"          dynamodbav:"rank_key"`
	TTL       int64  `json:"-"          dynamodbav:"ttl,omitempty"`
}

// BoardEntry is the API shape of a ranked row.
type BoardEntry struct {
	Rank       int    `json:"rank"`
	StudentID  string `json:"student_id"`
	Name       string `json:"name"`
	AvatarURL  string `json:"avatar_url,omitempty"`
	Region     string `json:"region,omitempty"`
	Points     int    `json:"points"`
	Attempts   int    `json:"attempts"`
	AvgPercent int    `json:"avg_percent"`
	Seconds    int    `json:"seconds"`
	Late       bool   `json:"late"`
}

// AddisLocation is UTC+3 with no DST; a fixed zone avoids a tzdata dependency.
var AddisLocation = time.FixedZone("Africa/Addis_Ababa", 3*3600)

// PeriodKey returns the period key of t, e.g. 2026-10-13, 2026-W42, 2026-10, all.
func PeriodKey(period string, t time.Time) string {
	t = t.In(AddisLocation)
	switch period {
	case PeriodDay:
		return t.Format("2006-01-02")
	case PeriodWeek:
		y, w := t.ISOWeek() // ISO weeks start on Monday
		return fmt.Sprintf("%d-W%02d", y, w)
	case PeriodMonth:
		return t.Format("2006-01")
	}
	return "all"
}

// BoardKey builds {period}:{periodKey}:{program}:{stream or all}.
func BoardKey(period string, t time.Time, program, stream string) string {
	if stream == "" {
		stream = "all"
	}
	return fmt.Sprintf("%s:%s:%s:%s", period, PeriodKey(period, t), program, stream)
}

// ContestBoardKey is the per-assessment board.
func ContestBoardKey(contestID string) string { return "contest:" + contestID }

// RankKey = points*1_000_000 + (999_999 - min(seconds, 999_999)).
func RankKey(points, seconds int) int64 {
	if seconds < 0 {
		seconds = 0
	}
	if seconds > 999999 {
		seconds = 999999
	}
	return int64(points)*1000000 + int64(999999-seconds)
}

// BoardTTL is the expiry (unix seconds) for a row: day 35 days, week 120 days, others none.
func BoardTTL(period string, now time.Time) int64 {
	switch period {
	case PeriodDay:
		return now.Add(35 * 24 * time.Hour).Unix()
	case PeriodWeek:
		return now.Add(120 * 24 * time.Hour).Unix()
	}
	return 0
}
