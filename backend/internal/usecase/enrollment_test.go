package usecase

import (
	"errors"
	"testing"

	"victory-contest-go/internal/domain"
)

func TestValidateEnrollment(t *testing.T) {
	progs := []domain.AcademyProgram{
		{ID: "grade-12", IsActive: true, OpenForRegistration: true, AvailableStreams: []string{"natural-science", "social-science"}},
		{ID: "freshman", IsActive: true, OpenForRegistration: true, AvailableStreams: []string{domain.StreamCommon}},
		{ID: "closed", IsActive: true, OpenForRegistration: false, AvailableStreams: []string{domain.StreamCommon}},
		{ID: "off", IsActive: false, OpenForRegistration: true, AvailableStreams: []string{domain.StreamCommon}},
	}
	if s, err := ValidateEnrollment(progs, "grade-12", "natural-science", true); err != nil || s != "natural-science" {
		t.Errorf("natural: %q %v", s, err)
	}
	if _, err := ValidateEnrollment(progs, "grade-12", "", true); !errors.Is(err, ErrStreamRequired) {
		t.Errorf("stream required: %v", err)
	}
	if _, err := ValidateEnrollment(progs, "grade-12", "common", true); !errors.Is(err, ErrStreamNotAllowed) {
		t.Errorf("common not enrollable in a stream program: %v", err)
	}
	// common-only programs skip the stream step and ignore a bogus stream
	if s, err := ValidateEnrollment(progs, "freshman", "natural-science", true); err != nil || s != domain.StreamCommon {
		t.Errorf("freshman: %q %v", s, err)
	}
	if _, err := ValidateEnrollment(progs, "closed", "", true); !errors.Is(err, ErrProgramClosed) {
		t.Errorf("closed: %v", err)
	}
	if _, err := ValidateEnrollment(progs, "closed", "", false); err != nil {
		t.Errorf("closed but admin enrol allowed: %v", err)
	}
	if _, err := ValidateEnrollment(progs, "off", "", true); !errors.Is(err, ErrUnknownProgram) {
		t.Errorf("inactive: %v", err)
	}
	if _, err := ValidateEnrollment(progs, "nope", "", true); !errors.Is(err, ErrUnknownProgram) {
		t.Errorf("unknown: %v", err)
	}
}

func TestSubmissionIDDeterministic(t *testing.T) {
	if SubmissionID("c1", "s1") != SubmissionID(" c1 ", "s1 ") || SubmissionID("c1", "s1") == SubmissionID("c1", "s2") {
		t.Error("SubmissionID must be deterministic and per (contest, student)")
	}
}

func TestEnrichProgramDoesNotOverwrite(t *testing.T) {
	cur := domain.AcademyProgram{ID: "grade-12", Group: "Custom group", Features: []string{"lectures"}}
	seed := domain.AcademyProgram{Kind: "school_grade", Group: "School grades", Grade: "12", SortOrder: 40, OpenForRegistration: true, Features: []string{"lectures", "assessments"}}
	if !enrichProgram(&cur, seed) {
		t.Fatal("expected change")
	}
	if cur.Group != "Custom group" || len(cur.Features) != 1 {
		t.Errorf("admin values overwritten: %+v", cur)
	}
	if cur.Kind != "school_grade" || cur.Grade != "12" || cur.SortOrder != 40 || !cur.OpenForRegistration {
		t.Errorf("empty fields not filled: %+v", cur)
	}
	if enrichProgram(&cur, seed) {
		t.Error("second run must be a no-op (idempotent)")
	}
}
