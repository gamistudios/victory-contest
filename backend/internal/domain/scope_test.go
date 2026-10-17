package domain

import "testing"

func TestScopeVisibleTo(t *testing.T) {
	nat := Enrollment{ProgramID: "grade-12", StreamID: "natural-science"}
	soc := Enrollment{ProgramID: "grade-12", StreamID: "social-science"}
	fresh := Enrollment{ProgramID: "freshman", StreamID: StreamCommon}
	cases := []struct {
		name string
		s    Scope
		e    Enrollment
		want bool
	}{
		{"own stream", Scope{ProgramID: "grade-12", StreamID: "natural-science"}, nat, true},
		{"other stream", Scope{ProgramID: "grade-12", StreamID: "social-science"}, nat, false},
		{"common visible to natural", Scope{ProgramID: "grade-12", StreamID: StreamCommon}, nat, true},
		{"common visible to social", Scope{ProgramID: "grade-12", StreamID: StreamCommon}, soc, true},
		{"other program", Scope{ProgramID: "grade-11", StreamID: StreamCommon}, nat, false},
		{"common-only program", Scope{ProgramID: "freshman", StreamID: StreamCommon}, fresh, true},
		{"empty program never visible", Scope{StreamID: StreamCommon}, nat, false},
	}
	for _, c := range cases {
		if got := c.s.VisibleTo(c.e); got != c.want {
			t.Errorf("%s: got %v want %v", c.name, got, c.want)
		}
	}
}

func TestScopeMatches(t *testing.T) {
	s := Scope{ProgramID: "grade-12", StreamID: "natural-science", SubjectID: "physics", ChapterID: "c1"}
	common := Scope{ProgramID: "grade-12", StreamID: StreamCommon, SubjectID: "english"}
	if !s.Matches(ScopeFilter{}) {
		t.Error("empty filter must match")
	}
	if !s.Matches(ScopeFilter{ProgramIDs: []string{"grade-11", "grade-12"}, StreamIDs: []string{"natural-science"}, SubjectID: "physics"}) {
		t.Error("expected match")
	}
	if s.Matches(ScopeFilter{StreamIDs: []string{"social-science"}}) {
		t.Error("stream mismatch must not match")
	}
	if !common.Matches(ScopeFilter{StreamIDs: []string{"social-science"}}) {
		t.Error("common content must match any stream filter")
	}
	if s.Matches(ScopeFilter{SubjectID: "chem"}) || s.Matches(ScopeFilter{ChapterID: "c2"}) || s.Matches(ScopeFilter{ProgramIDs: []string{"grade-9"}}) {
		t.Error("subject/chapter/program mismatch must not match")
	}
}

func TestProgramStreams(t *testing.T) {
	g12 := AcademyProgram{AvailableStreams: []string{"natural-science", "social-science"}}
	fresh := AcademyProgram{AvailableStreams: []string{StreamCommon}}
	if !g12.NeedsStreamChoice() || fresh.NeedsStreamChoice() {
		t.Error("NeedsStreamChoice wrong")
	}
	if !g12.AllowsStream("natural-science") || g12.AllowsStream(StreamCommon) || g12.AllowsStream("other") {
		t.Error("g12 AllowsStream wrong")
	}
	if !fresh.AllowsStream(StreamCommon) || fresh.AllowsStream("natural-science") {
		t.Error("fresh AllowsStream wrong")
	}
	p := AcademyProgram{Features: []string{FeatureLectures}}
	if !p.HasFeature(FeatureLectures) || p.HasFeature(FeatureHabits) {
		t.Error("HasFeature wrong")
	}
}

func TestGrades(t *testing.T) {
	for _, g := range []string{"9", "10", "11", "12", " 12 "} {
		if !IsValidGrade(g) {
			t.Errorf("%q should be valid", g)
		}
	}
	for _, g := range []string{"", "1", "4", "13", "Grade 12", "8"} {
		if IsValidGrade(g) {
			t.Errorf("%q should be invalid", g)
		}
	}
	m := map[string]string{"1": "9", "2": "10", "3": "11", "4": "12"}
	for old, want := range m {
		if got, ok := LegacyGradeToCurrent(old); !ok || got != want {
			t.Errorf("legacy %s -> %s,%v", old, got, ok)
		}
	}
	if _, ok := LegacyGradeToCurrent("12"); ok {
		t.Error("valid grade must not be remapped")
	}
}

func TestLocationsValidatePick(t *testing.T) {
	l := Locations{Regions: []Region{{ID: "aa", Name: "Addis Ababa", Active: true, Cities: []City{{ID: "bole", Name: "Bole", Active: true}, {ID: "old", Name: "Old", Active: false}}}, {ID: "x", Name: "Closed", Active: false}}}
	if !l.ValidatePick("aa", "bole", "", "") {
		t.Error("valid ids")
	}
	if l.ValidatePick("aa", "old", "", "") || l.ValidatePick("x", "", "", "Town") || l.ValidatePick("zz", "bole", "", "") {
		t.Error("inactive/unknown must fail")
	}
	if !l.ValidatePick("", "", "Somewhere", "Town") {
		t.Error("other free text should pass")
	}
	if l.ValidatePick("", "", "S", "Town") || l.ValidatePick("", "", " ", " ") {
		t.Error("too short other text must fail")
	}
	if !l.ValidatePick("aa", "", "", "Other City") {
		t.Error("known region + other city")
	}
}
