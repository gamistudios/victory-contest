package domain

import (
	"testing"
	"time"
)

func TestPeriodKeysUseAddisTime(t *testing.T) {
	// 22:30 UTC on Oct 12 is 01:30 on Oct 13 in Addis Ababa (Tuesday, ISO week 42).
	ts := time.Date(2026, 10, 12, 22, 30, 0, 0, time.UTC)
	if got := PeriodKey(PeriodDay, ts); got != "2026-10-13" {
		t.Fatalf("day key = %s", got)
	}
	if got := PeriodKey(PeriodWeek, ts); got != "2026-W42" {
		t.Fatalf("week key = %s", got)
	}
	if got := BoardKey(PeriodDay, ts, "grade-12", "natural-science"); got != "day:2026-10-13:grade-12:natural-science" {
		t.Fatalf("day board = %s", got)
	}
	if got := BoardKey(PeriodWeek, ts, "entrance-exam", ""); got != "week:2026-W42:entrance-exam:all" {
		t.Fatalf("week board = %s", got)
	}
	if got := BoardKey(PeriodMonth, ts, "grade-12", "natural-science"); got != "month:2026-10:grade-12:natural-science" {
		t.Fatalf("board key = %s", got)
	}
	if got := BoardKey(PeriodAll, ts, "freshman", ""); got != "all:all:freshman:all" {
		t.Fatalf("all key = %s", got)
	}
	if got := BoardKey(PeriodMonth, ts, "freshman", StreamCommon); got != "month:2026-10:freshman:common" {
		t.Fatalf("common board = %s", got)
	}
}

func TestRankKeyTieBreaksOnTime(t *testing.T) {
	if RankKey(90, 100) <= RankKey(90, 200) {
		t.Fatal("faster time must rank higher at equal points")
	}
	if RankKey(91, 999999) <= RankKey(90, 0) {
		t.Fatal("more points must beat a faster time")
	}
}

func TestBoardTTLOnlyOnDayAndWeek(t *testing.T) {
	now := time.Date(2026, 10, 13, 0, 0, 0, 0, time.UTC)
	if BoardTTL(PeriodDay, now) != now.Add(35*24*time.Hour).Unix() || BoardTTL(PeriodWeek, now) != now.Add(120*24*time.Hour).Unix() {
		t.Fatal("day/week ttl wrong")
	}
	if BoardTTL(PeriodMonth, now) != 0 || BoardTTL(PeriodAll, now) != 0 {
		t.Fatal("month/all must not expire")
	}
}

func TestWeekStartsMondayInAddis(t *testing.T) {
	// Sunday 21:30 UTC is Monday 00:30 in Addis: already the next ISO week.
	sunUTC := time.Date(2026, 10, 18, 21, 30, 0, 0, time.UTC)
	satUTC := time.Date(2026, 10, 18, 20, 30, 0, 0, time.UTC) // Sunday 23:30 Addis
	if PeriodKey(PeriodWeek, sunUTC) == PeriodKey(PeriodWeek, satUTC) {
		t.Fatal("week boundary must fall at Monday 00:00 Addis time")
	}
}
