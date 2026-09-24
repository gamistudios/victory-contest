package main

import (
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

func ents(pairs ...interface{}) []missedEntry {
	out := make([]missedEntry, 0, len(pairs)/2)
	for i := 0; i < len(pairs); i += 2 {
		out = append(out, missedEntry{IDKey: "ID", ValKey: "SelectedAnswer", ID: pairs[i].(string), Value: int64(pairs[i+1].(int))})
	}
	return out
}

func values(entries []missedEntry) map[string]int64 {
	out := map[string]int64{}
	for _, e := range entries {
		out[e.ID] = e.Value
	}
	return out
}

func counts(kv map[string]int) map[string]int { return kv }

func TestMigrateEntries_ProvenZeroBasedIsShifted(t *testing.T) {
	// q1 answered option 0 (impossible canonically) proves the row; the
	// ambiguous q2=1 and the skipped q3=-1 ride along correctly.
	in := ents("q1", 0, "q2", 1, "q3", -1, "q4", 3)
	res := migrateEntries(in, counts(map[string]int{"q1": 4, "q2": 4, "q3": 4, "q4": 4}))
	if res.Status != statusConvert {
		t.Fatalf("status = %v, want convert", res.Status)
	}
	got := values(res.Entries)
	want := map[string]int64{"q1": 1, "q2": 2, "q3": -1, "q4": 4}
	for k, v := range want {
		if got[k] != v {
			t.Fatalf("%s = %d, want %d (full: %v)", k, got[k], v, got)
		}
	}
	// q4=3 was in-range ambiguous, q1=0 proved 0-based -> whole row shifted.
}

func TestMigrateEntries_Idempotent(t *testing.T) {
	in := ents("q1", 0, "q2", 3, "q3", -1)
	count := counts(map[string]int{"q1": 4, "q2": 4, "q3": 4})

	first := migrateEntries(in, count)
	if first.Status != statusConvert {
		t.Fatalf("first pass = %v, want convert", first.Status)
	}
	second := migrateEntries(first.Entries, count)
	if second.Status != statusCanonical {
		t.Fatalf("second pass = %v, want canonical (q2 shifted to 4 proves 1-based)", second.Status)
	}
	third := migrateEntries(second.Entries, count)
	if third.Status != statusCanonical {
		t.Fatalf("third pass = %v, want canonical", third.Status)
	}
	if values(third.Entries)["q1"] != 1 || values(third.Entries)["q2"] != 4 {
		t.Fatal("re-runs must not move values again")
	}
}

func TestMigrateEntries_IdempotentWhenNothingProvesLastOption(t *testing.T) {
	// After conversion, a row whose values all stay below len(options) is
	// merely undetectable on re-runs — crucially NOT re-converted.
	in := ents("q1", 0, "q2", 1)
	count := counts(map[string]int{"q1": 5, "q2": 5})
	first := migrateEntries(in, count)
	if first.Status != statusConvert {
		t.Fatalf("first pass = %v, want convert", first.Status)
	}
	second := migrateEntries(first.Entries, count)
	if second.Status != statusUndetectable {
		t.Fatalf("second pass = %v, want undetectable", second.Status)
	}
	if values(second.Entries)["q1"] != 1 {
		t.Fatal("undetectable rows must never be shifted again")
	}
}

func TestMigrateEntries_CanonicalUntouched(t *testing.T) {
	in := ents("q1", 1, "q2", 4) // q2 picked the LAST option: proves 1-based
	res := migrateEntries(in, counts(map[string]int{"q1": 4, "q2": 4}))
	if res.Status != statusCanonical {
		t.Fatalf("status = %v, want canonical", res.Status)
	}
	if values(res.Entries)["q1"] != 1 || values(res.Entries)["q2"] != 4 {
		t.Fatal("canonical rows must not be rewritten")
	}
}

func TestMigrateEntries_AmbiguousIsUndetectable(t *testing.T) {
	in := ents("q1", 2, "q3", -1) // 2 is legal in both conventions
	res := migrateEntries(in, counts(map[string]int{"q1": 4, "q3": 4}))
	if res.Status != statusUndetectable {
		t.Fatalf("status = %v, want undetectable", res.Status)
	}
}

func TestMigrateEntries_ConflictingIsNeverConverted(t *testing.T) {
	in := ents("q1", 0, "q2", 4) // 0 proves 0-based, 4 proves 1-based
	res := migrateEntries(in, counts(map[string]int{"q1": 4, "q2": 4}))
	if res.Status != statusConflicting {
		t.Fatalf("status = %v, want conflicting", res.Status)
	}
	if values(res.Entries)["q1"] != 0 {
		t.Fatal("conflicting rows must be reported, not rewritten")
	}
}

func TestMigrateEntries_DeletedQuestionStillProven(t *testing.T) {
	// value 0 proves 0-based even when the question row is gone; the other
	// value in the same proven row is shifted unconditionally (documented).
	in := ents("gone", 0, "also-gone", 2)
	res := migrateEntries(in, counts(map[string]int{}))
	if res.Status != statusConvert {
		t.Fatalf("status = %v, want convert", res.Status)
	}
	if values(res.Entries)["also-gone"] != 3 {
		t.Fatalf("sibling value = %d, want 3", values(res.Entries)["also-gone"])
	}
	if len(res.Notes) == 0 {
		t.Fatal("expected a note about deleted question rows")
	}
}

func TestMigrateEntries_OutOfRangeKeptAndNotShifted(t *testing.T) {
	// A stale client's missed-list marker (9 on a 4-option question) is
	// invalid under both conventions: prove the row from the 0, keep the 9.
	in := ents("q1", 0, "q2", 9)
	res := migrateEntries(in, counts(map[string]int{"q1": 4, "q2": 4}))
	if res.Status != statusConvert {
		t.Fatalf("status = %v, want convert", res.Status)
	}
	got := values(res.Entries)
	if got["q2"] != 9 {
		t.Fatalf("out-of-range value became %d, want 9 (kept as-is)", got["q2"])
	}
	if len(res.Notes) == 0 {
		t.Fatal("expected an out-of-range note")
	}
}

func TestMigrateEntries_SkippedOnlyRow(t *testing.T) {
	in := ents("q1", -1, "q2", -1)
	res := migrateEntries(in, counts(map[string]int{"q1": 4, "q2": 4}))
	if res.Status != statusNoSelections {
		t.Fatalf("status = %v, want no-selections", res.Status)
	}
}

func TestMissedQuestionsRoundTrip(t *testing.T) {
	// attributevalue marshals SubmissionMissedQuestionDto WITHOUT tags, so
	// real rows store ID/SelectedAnswer; the parser must read that shape and
	// the encoder must write the same keys back.
	encoded := encodeMissedQuestions(ents("q1", 1, "q2", -1))
	item := map[string]types.AttributeValue{"missed_questions": encoded}

	entries, err := parseMissedQuestions(item)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(entries) != 2 || entries[0].IDKey != "ID" || entries[0].ValKey != "SelectedAnswer" {
		t.Fatalf("unexpected entries: %+v", entries)
	}

	// snake_case spelling (e.g. hand-seeded rows) is also accepted and
	// preserved on rewrite.
	legacy := &types.AttributeValueMemberL{Value: []types.AttributeValue{
		&types.AttributeValueMemberM{Value: map[string]types.AttributeValue{
			"id":              &types.AttributeValueMemberS{Value: "q1"},
			"selected_answer": &types.AttributeValueMemberN{Value: "0"},
		}},
	}}
	legacyItem := map[string]types.AttributeValue{"missed_questions": legacy}
	entries, err = parseMissedQuestions(legacyItem)
	if err != nil {
		t.Fatalf("parse legacy: %v", err)
	}
	if entries[0].IDKey != "id" || entries[0].ValKey != "selected_answer" || entries[0].Value != 0 {
		t.Fatalf("legacy spellings not preserved: %+v", entries)
	}
	out := encodeMissedQuestions(entries).(*types.AttributeValueMemberL)
	first := out.Value[0].(*types.AttributeValueMemberM)
	if first.Value["selected_answer"].(*types.AttributeValueMemberN).Value != "0" {
		t.Fatal("encoder must keep the row's original key spelling")
	}
}
