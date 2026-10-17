package usecase

import (
	"fmt"
	"testing"

	"victory-contest-go/internal/domain"
)

func feedStudent() *domain.Student {
	return &domain.Student{
		ID:               "s1",
		PrimaryProgramID: "g12",
		Enrollments: []domain.Enrollment{
			{ProgramID: "g12", StreamID: "natural"},
			{ProgramID: "g10", StreamID: domain.StreamCommon},
		},
	}
}

// feedFakes records the scope filter the usecase hands to the assessment read path.
func feedFakes(gotFilter *domain.ScopeFilter, n int) FeedSources {
	return FeedSources{
		Student: func(id string) (*domain.Student, error) { return feedStudent(), nil },
		Assessments: func(_ string, f domain.ScopeFilter) ([]AssessmentMeta, error) {
			*gotFilter = f
			out := make([]AssessmentMeta, 0, n)
			for i := 0; i < n; i++ {
				kind, access := "contest", "free"
				if i%2 == 1 {
					kind, access = "exam", "premium"
				}
				out = append(out, AssessmentMeta{ID: fmt.Sprintf("a%02d", i), Kind: kind, Access: access})
			}
			return out, nil
		},
		Subjects: func(_, program, stream string) ([]AcademySubjectView, error) {
			// TotalModulesCount is promoted from the embedded domain.AcademySubject,
			// so it cannot appear in a composite literal (go1.27+); assign it after.
			free := AcademySubjectView{}
			free.TotalModulesCount, free.ID, free.StreamID = 4, program+"-free", stream
			mixed := AcademySubjectView{LockedModules: 1}
			mixed.TotalModulesCount, mixed.ID = 4, program+"-mixed"
			prem := AcademySubjectView{LockedModules: 4}
			prem.TotalModulesCount, prem.ID = 4, program+"-prem"
			return []AcademySubjectView{free, mixed, prem}, nil
		},
		Board: func(_, period, program, stream string) (*BoardView, error) {
			return &BoardView{Period: period, ProgramID: program, Entries: make([]domain.BoardEntry, 5)}, nil
		},
	}
}

func TestFeedDefaultsToPrimaryProgramOwnStreamPlusCommon(t *testing.T) {
	var f domain.ScopeFilter
	v, err := NewFeedUsecase(feedFakes(&f, 3)).Feed("s1", FeedQuery{})
	if err != nil {
		t.Fatal(err)
	}
	if v.ProgramID != "g12" || !v.Mine || len(v.Programs) != 1 {
		t.Fatalf("unexpected resolution: %+v", v)
	}
	if len(f.ProgramIDs) != 1 || f.ProgramIDs[0] != "g12" {
		t.Fatalf("program filter = %v", f.ProgramIDs)
	}
	want := map[string]bool{"natural": true, domain.StreamCommon: true}
	if len(f.StreamIDs) != 2 || !want[f.StreamIDs[0]] || !want[f.StreamIDs[1]] {
		t.Fatalf("stream filter = %v, want own stream + common", f.StreamIDs)
	}
}

func TestFeedStreamAllWidensAndExplicitStreamNarrows(t *testing.T) {
	var f domain.ScopeFilter
	u := NewFeedUsecase(feedFakes(&f, 1))
	if _, err := u.Feed("s1", FeedQuery{Stream: FeedStreamAll}); err != nil {
		t.Fatal(err)
	}
	if len(f.StreamIDs) != 0 {
		t.Fatalf("stream=all must not filter streams, got %v", f.StreamIDs)
	}
	if _, err := u.Feed("s1", FeedQuery{Stream: "social"}); err != nil {
		t.Fatal(err)
	}
	if len(f.StreamIDs) != 2 || f.StreamIDs[0] != "social" || f.StreamIDs[1] != domain.StreamCommon {
		t.Fatalf("explicit stream filter = %v", f.StreamIDs)
	}
}

func TestFeedMineCoversAllEnrolmentsAndExploreIsNotMine(t *testing.T) {
	var f domain.ScopeFilter
	u := NewFeedUsecase(feedFakes(&f, 1))
	v, _ := u.Feed("s1", FeedQuery{Program: FeedMine})
	if len(v.Programs) != 2 || !v.Mine || v.ProgramID != FeedMine {
		t.Fatalf("mine view = %+v", v)
	}
	if len(v.Leaderboards) != 2 {
		t.Fatalf("want a board per enrolled program, got %d", len(v.Leaderboards))
	}
	v, _ = u.Feed("s1", FeedQuery{Program: "g11"})
	if v.Mine {
		t.Fatal("exploring a program the student is not in must not be mine")
	}
	if len(v.Leaderboards) != 0 {
		t.Fatalf("boards are enrolment-only, got %d", len(v.Leaderboards))
	}
}

func TestFeedPagingAndKindAccessFilters(t *testing.T) {
	var f domain.ScopeFilter
	u := NewFeedUsecase(feedFakes(&f, 45))
	v, _ := u.Feed("s1", FeedQuery{})
	if len(v.Assessments) != feedPageSize || v.NextCursor != "20" {
		t.Fatalf("page 1 = %d next=%q", len(v.Assessments), v.NextCursor)
	}
	if len(v.Lectures) == 0 || len(v.Leaderboards) == 0 {
		t.Fatal("first page must carry lectures and boards")
	}
	v, _ = u.Feed("s1", FeedQuery{Cursor: "40"})
	if len(v.Assessments) != 5 || v.NextCursor != "" {
		t.Fatalf("last page = %d next=%q", len(v.Assessments), v.NextCursor)
	}
	if len(v.Lectures) != 0 || len(v.Leaderboards) != 0 {
		t.Fatal("later pages must be assessments only")
	}
	v, _ = u.Feed("s1", FeedQuery{Kind: "exam", Access: "premium"})
	for _, a := range v.Assessments {
		if a.Kind != "exam" || a.Access != "premium" {
			t.Fatalf("filter leaked %+v", a)
		}
	}
}

func TestFeedLectureAccessFlags(t *testing.T) {
	var f domain.ScopeFilter
	v, _ := NewFeedUsecase(feedFakes(&f, 0)).Feed("s1", FeedQuery{})
	got := map[string]string{}
	for _, l := range v.Lectures {
		got[l.ID] = l.Access
	}
	if got["g12-free"] != "free" || got["g12-mixed"] != "mixed" || got["g12-prem"] != "premium" {
		t.Fatalf("access flags = %v", got)
	}
}
