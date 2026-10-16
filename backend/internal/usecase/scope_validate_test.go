package usecase

import (
	"errors"
	"testing"

	"victory-contest-go/internal/domain"
)

func catalogForScope() *CatalogView {
	return &CatalogView{
		Programs: []domain.AcademyProgram{
			{ID: "grade-12", IsActive: true, AvailableStreams: []string{"natural-science", "social-science"}},
			{ID: "freshman", IsActive: true, AvailableStreams: []string{domain.StreamCommon}},
			{ID: "retired", IsActive: false, AvailableStreams: []string{domain.StreamCommon}},
		},
		Subjects: []domain.AcademySubject{{ID: "physics"}, {ID: "english"}},
		Chapters: []domain.AcademyChapter{{ID: "ch-kinematics", SubjectID: "physics"}, {ID: "ch-grammar", SubjectID: "english"}},
	}
}

func TestValidateScopeAgainst(t *testing.T) {
	v := catalogForScope()
	ok := []domain.Scope{
		{ProgramID: "grade-12", StreamID: "natural-science"},
		{ProgramID: "grade-12", StreamID: domain.StreamCommon}, // common always allowed
		{ProgramID: "freshman"},                                // empty stream reads as common
		{ProgramID: "grade-12", StreamID: "natural-science", SubjectID: "physics", ChapterID: "ch-kinematics"},
		{ProgramID: "grade-12", StreamID: domain.StreamCommon, SubjectID: "english"},
	}
	for i, s := range ok {
		if err := ValidateScopeAgainst(v, s); err != nil {
			t.Fatalf("case %d %v must pass: %v", i, s, err)
		}
	}

	bad := []struct {
		name string
		s    domain.Scope
	}{
		{"no program", domain.Scope{}},
		{"unknown program", domain.Scope{ProgramID: "grade-99"}},
		{"inactive program", domain.Scope{ProgramID: "retired"}},
		{"stream not offered", domain.Scope{ProgramID: "grade-12", StreamID: "engineering"}},
		{"stream outside common-only program", domain.Scope{ProgramID: "freshman", StreamID: "natural-science"}},
		{"unknown subject", domain.Scope{ProgramID: "grade-12", SubjectID: "alchemy"}},
		{"chapter of another subject", domain.Scope{ProgramID: "grade-12", SubjectID: "physics", ChapterID: "ch-grammar"}},
		{"unknown chapter", domain.Scope{ProgramID: "grade-12", ChapterID: "ch-none"}},
	}
	for _, tc := range bad {
		if err := ValidateScopeAgainst(v, tc.s); !errors.Is(err, ErrInvalidScope) {
			t.Fatalf("%s: got %v, want ErrInvalidScope", tc.name, err)
		}
	}
}

func TestValidateScopeAgainstNilCatalogIsLenient(t *testing.T) {
	// catalog read failure must not block admins (documented behaviour)
	if err := ValidateScopeAgainst(nil, domain.Scope{ProgramID: "whatever"}); err != nil {
		t.Fatalf("nil catalog: %v", err)
	}
}
