package usecase

import (
	"errors"
	"strings"
	"testing"
	"time"
	"victory-contest-go/internal/domain"
)

// stubSubmissionRepo is a minimal in-memory SubmissionRepository for leaderboard tests.
type stubSubmissionRepo struct {
	all       []domain.Submission
	byContest map[string][]domain.Submission
	byStudent map[string][]domain.Submission
}

func (s *stubSubmissionRepo) AddSubmission(domain.Submission) (string, error) { return "", nil }
func (s *stubSubmissionRepo) GetSubmissionByID(string) (*domain.Submission, error) {
	return nil, nil
}
func (s *stubSubmissionRepo) GetAllSubmissions() ([]domain.Submission, error) { return s.all, nil }
func (s *stubSubmissionRepo) GetSubmissionsByContest(id string) ([]domain.Submission, error) {
	return s.byContest[id], nil
}
func (s *stubSubmissionRepo) GetSubmissionsByStudent(id string) ([]domain.Submission, error) {
	return s.byStudent[id], nil
}
func (s *stubSubmissionRepo) GetSubmissionsByStudentAndContest(string, string) (*domain.Submission, error) {
	return nil, errors.New("not implemented")
}

func newUsecaseWithRepo(repo SubmissionRepository) SubmissionUsecase {
	return &submissionUsecase{subRepo: repo}
}

func sub(id, userID, contestID, name, timeSpend string, score float64, missed int, when time.Time) domain.Submission {
	mq := make([]domain.SubmissionMissedQuestionDto, missed)
	for i := range mq {
		mq[i] = domain.SubmissionMissedQuestionDto{ID: string(rune('a' + i)), SelectedAnswer: 0}
	}
	return domain.Submission{
		ID:             id,
		ContestID:      contestID,
		StudentID:      userID,
		Student:        domain.StudentSub{ID: userID, Name: name},
		Score:          score,
		MissedQuestions: mq,
		SubmissionTime: when,
		TimeSpend:      timeSpend,
	}
}

// #23: "all" timeframe must be truly all-time, not ~1 year.
func TestCalculateStartTime_AllIsAllTime(t *testing.T) {
	u := &submissionUsecase{}
	start, err := u.calculateStartTime("all")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	twoYearsAgo := time.Now().AddDate(-2, 0, 0)
	if !start.Before(twoYearsAgo) {
		t.Fatalf("expected all-time start before two years ago, got %v", start)
	}
}

// #23: an older-than-1-year submission still appears in the "all" leaderboard,
// but is excluded from a short window.
func TestGetLeaderboardByTimeFrame_AllIncludesOldSubmissions(t *testing.T) {
	old := sub("1", "u-old", "c1", "Old", "0:10:00", 5, 0, time.Now().AddDate(-2, 0, 0))
	recent := sub("2", "u-new", "c1", "New", "0:10:00", 5, 0, time.Now())
	repo := &stubSubmissionRepo{all: []domain.Submission{old, recent}}
	u := newUsecaseWithRepo(repo)

	all, err := u.GetLeaderboardByTimeFrame("all")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	var hasOld, hasNew bool
	for _, e := range all {
		if e.UserID == "u-old" {
			hasOld = true
		}
		if e.UserID == "u-new" {
			hasNew = true
		}
	}
	if !hasOld || !hasNew {
		t.Fatalf("expected both old and new users in all-time board, got %+v", all)
	}

	week, err := u.GetLeaderboardByTimeFrame("week")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, e := range week {
		if e.UserID == "u-old" {
			t.Fatalf("old submission leaked into weekly board: %+v", week)
		}
	}
}

// #25: global board tie-break must sort on the numeric seconds, not the
// (unformatted, empty) string field, so faster wins deterministically.
func TestSortAndRank_TieBreakByFasterSeconds(t *testing.T) {
	u := &submissionUsecase{}
	agg := map[string]*domain.LeaderboardEntry{
		"slow": {UserID: "slow", UserName: "Slow", Score: 10, TimeTakenSeconds: 2700},
		"fast": {UserID: "fast", UserName: "Fast", Score: 10, TimeTakenSeconds: 450},
	}
	board := u.sortAndRank(agg)
	if len(board) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(board))
	}
	if board[0].UserID != "fast" {
		t.Fatalf("expected faster time to rank first, got %q", board[0].UserID)
	}
	if board[0].Rank != 1 || board[1].Rank != 2 {
		t.Fatalf("ranks not assigned: %+v", board)
	}
	if board[0].TimeTaken != "07:30" {
		t.Fatalf("expected formatted time_taken 07:30, got %q", board[0].TimeTaken)
	}
}

// #24: contest ranking tie-break must prefer faster numeric time, not the
// lexicographic HH:MM:SS string comparison that the old code used.
func TestGetRankingsForContest_TieBreakFasterWins(t *testing.T) {
	// Equal score, "0:45:00" (2700s) vs "0:07:30" (450s).
	// Lexicographic compare would wrongly rank "0:45:00" ahead of "0:07:30".
	slow := sub("1", "u-slow", "c1", "Slow", "0:45:00", 8, 1, time.Now())
	fast := sub("2", "u-fast", "c1", "Fast", "0:07:30", 8, 1, time.Now())
	repo := &stubSubmissionRepo{byContest: map[string][]domain.Submission{"c1": {slow, fast}}}
	u := newUsecaseWithRepo(repo)

	rankings, err := u.GetRankingsForContest("c1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rankings[0].UserId != "u-fast" {
		t.Fatalf("expected faster submission ranked first, got %q", rankings[0].UserId)
	}
}

// #18: badge dedupe guard. Previously the `already` set was populated but never
// consulted, so every submission re-appended the same badge ids. mergeNewBadges
// must return each id exactly once and report "no change" when a repeat
// submission earns only badges the student already holds (so the profile is not
// rewritten and never grows duplicates).
func TestMergeNewBadges_NoDuplicatesAcrossSubmissions(t *testing.T) {
	earned := []string{"1", "2", "3", "6"}

	// Submission #1 on a fresh student (nil badge list).
	after1, changed1 := mergeNewBadges(nil, earned)
	if !changed1 {
		t.Fatal("expected first award to change the badge list")
	}
	if got, want := strings.Join(after1, ","), "1,2,3,6"; got != want {
		t.Fatalf("first award = %q, want %q", got, want)
	}

	// Submission #2 earning the same badges must not append duplicates.
	after2, changed2 := mergeNewBadges(after1, earned)
	if changed2 {
		t.Fatalf("expected no change on repeat award, got %+v", after2)
	}
	if got, want := strings.Join(after2, ","), "1,2,3,6"; got != want {
		t.Fatalf("repeat award changed the list to %q, want %q", got, want)
	}

	// Mixed existing + new: only the genuinely-new id is appended, once.
	after3, changed3 := mergeNewBadges(after2, []string{"3", "4"})
	if !changed3 {
		t.Fatal("expected new badge '4' to change the list")
	}
	if got, want := strings.Join(after3, ","), "1,2,3,6,4"; got != want {
		t.Fatalf("merge result = %q, want %q", got, want)
	}

	// Duplicate ids within a single earned batch are collapsed.
	after4, _ := mergeNewBadges(nil, []string{"5", "5", "5"})
	if got, want := strings.Join(after4, ","), "5"; got != want {
		t.Fatalf("in-batch dedupe = %q, want %q", got, want)
	}

	for _, b := range []struct {
		name  string
		badge []string
	}{{"after1", after1}, {"after2", after2}, {"after3", after3}, {"after4", after4}} {
		seen := map[string]bool{}
		for _, id := range b.badge {
			if seen[id] {
				t.Fatalf("%s contains duplicate badge id %q: %+v", b.name, id, b.badge)
			}
			seen[id] = true
		}
	}
}

// #26: average time must divide by contest count, not question count.
func TestGetStudentProfileStatistics_AvgTimePerContest(t *testing.T) {
	// 2 contests, times 3600s + 1800s = 5400s total -> avg 2700s/contest.
	// Questions total = (score+missed) sums to 30, so a question-based avg would be 180.
	s1 := sub("1", "u1", "c1", "Ana", "1:00:00", 10, 5, time.Now())
	s2 := sub("2", "u1", "c2", "Ana", "0:30:00", 10, 5, time.Now())
	repo := &stubSubmissionRepo{
		byStudent: map[string][]domain.Submission{"u1": {s1, s2}},
		all:       []domain.Submission{s1, s2},
	}
	u := newUsecaseWithRepo(repo)

	stats, err := u.GetStudentProfileStatistics("u1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if stats.TotalContests != 2 {
		t.Fatalf("expected 2 contests, got %d", stats.TotalContests)
	}
	if stats.AverageTime != 2700 {
		t.Fatalf("expected average time 2700s (total/contests), got %d", stats.AverageTime)
	}
}
