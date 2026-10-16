package domain

import "testing"

func TestContestPatchApplyCarriesOverUntouchedFields(t *testing.T) {
	c := Contest{
		ID: "c1", Mode: ContestModeSelfPaced, DurationMinutes: 60, LatePenaltyPercent: 10,
		Kind: ContestKindPractice, Reveal: RevealOnSubmit, ShuffleQuestions: true,
		Scope: &Scope{ProgramID: "grade-12", StreamID: "natural-science"},
	}

	// patch only the time limit: everything else must survive (D11 carry-over)
	newDur := 90
	var empty ContestPatch
	empty.DurationMinutes = &newDur
	if !empty.Apply(&c) {
		t.Fatal("Apply must report a provided field")
	}
	if c.DurationMinutes != 90 || c.Mode != ContestModeSelfPaced || c.Kind != ContestKindPractice ||
		c.Reveal != RevealOnSubmit || !c.ShuffleQuestions || c.Scope == nil || c.Scope.ProgramID != "grade-12" {
		t.Fatalf("untouched fields lost: %+v", c)
	}

	// zero-ish values must still apply when explicitly sent
	zero := 0
	noShuffle := false
	p := ContestPatch{LatePenaltyPercent: &zero, ShuffleQuestions: &noShuffle}
	if !p.Apply(&c) || c.LatePenaltyPercent != 0 || c.ShuffleQuestions {
		t.Fatalf("pointer zero values: penalty=%d shuffle=%v", c.LatePenaltyPercent, c.ShuffleQuestions)
	}

	// scope replacement does not alias the caller's struct
	s := Scope{ProgramID: "freshman", StreamID: StreamCommon}
	p2 := ContestPatch{Scope: &s}
	p2.Apply(&c)
	s.ProgramID = "mutated"
	if c.Scope.ProgramID != "freshman" {
		t.Fatalf("patch must copy the scope, got %+v", c.Scope)
	}

	// clear_scope drops it; an empty patch changes nothing and reports false
	if !(ContestPatch{ClearScope: true}).Apply(&c) || c.Scope != nil {
		t.Fatal("clear_scope must drop the scope")
	}
	before := c
	if (ContestPatch{}).Apply(&c) {
		t.Fatal("empty patch must report nothing provided")
	}
	if c.Mode != before.Mode || c.DurationMinutes != before.DurationMinutes || c.Kind != before.Kind {
		t.Fatal("empty patch mutated the contest")
	}
}

func TestEffectiveReadersOnLegacyRows(t *testing.T) {
	legacy := Contest{} // a row from before Phase 2
	if legacy.EffectiveMode() != ContestModeGlobal {
		t.Fatal("empty mode reads as global")
	}
	if legacy.EffectiveKind() != ContestKindContest {
		t.Fatal("empty kind reads as contest")
	}
	if legacy.EffectiveReveal() != RevealAtEnd {
		t.Fatal("contest default reveal is at_end")
	}
	pr := Contest{Kind: ContestKindPractice}
	if pr.EffectiveReveal() != RevealOnSubmit {
		t.Fatal("practice reveals on submit")
	}
	pe := Contest{Kind: ContestKindPastExam}
	if pe.EffectiveReveal() != RevealOnSubmit {
		t.Fatal("past exam reveals on submit")
	}
	// an explicit at_end on a practice contest is honoured
	if (Contest{Kind: ContestKindPractice, Reveal: RevealAtEnd}).EffectiveReveal() != RevealAtEnd {
		t.Fatal("explicit reveal wins")
	}
}
