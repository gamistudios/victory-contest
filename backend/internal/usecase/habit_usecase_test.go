package usecase

import (
	"testing"
	"time"
)

func TestComputeHabitStreaks(t *testing.T) {
	d := func(ids ...string) []string { return ids }
	cases := []struct {
		name             string
		done             map[string][]string
		today            string
		cur, best, total int
	}{
		{"empty", map[string][]string{}, "2026-11-05", 0, 0, 0},
		{"run through today", map[string][]string{"2026-11-03": d("a"), "2026-11-04": d("a", "b"), "2026-11-05": d("a")}, "2026-11-05", 3, 3, 4},
		{"today still open keeps streak", map[string][]string{"2026-11-03": d("a"), "2026-11-04": d("a")}, "2026-11-05", 2, 2, 2},
		{"broken yesterday", map[string][]string{"2026-11-02": d("a"), "2026-11-03": d("a")}, "2026-11-05", 0, 2, 2},
		{"gap keeps best", map[string][]string{"2026-11-01": d("a"), "2026-11-02": d("a"), "2026-11-03": d("a"), "2026-11-05": d("a")}, "2026-11-05", 1, 3, 4},
		{"empty list ignored", map[string][]string{"2026-11-04": {}, "2026-11-05": d("a")}, "2026-11-05", 1, 1, 1},
		{"month boundary", map[string][]string{"2026-10-31": d("a"), "2026-11-01": d("a")}, "2026-11-01", 2, 2, 2},
	}
	for _, c := range cases {
		cur, best, total := ComputeHabitStreaks(c.done, c.today)
		if cur != c.cur || best != c.best || total != c.total {
			t.Errorf("%s: got %d/%d/%d want %d/%d/%d", c.name, cur, best, total, c.cur, c.best, c.total)
		}
	}
}

func TestAddisDateAndDayNumber(t *testing.T) {
	// 22:30 UTC is already the next calendar day in Addis (UTC+3).
	if got := AddisDate(time.Date(2026, 11, 3, 22, 30, 0, 0, time.UTC)); got != "2026-11-04" {
		t.Fatalf("AddisDate = %s", got)
	}
	if n := HabitDayNumber("2026-11-01", "2026-11-01"); n != 1 {
		t.Fatalf("day 1 = %d", n)
	}
	if n := HabitDayNumber("2026-11-01", "2026-12-01"); n != 31 {
		t.Fatalf("day 31 = %d", n)
	}
}
