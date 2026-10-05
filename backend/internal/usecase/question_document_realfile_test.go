package usecase

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestParseQuestionsDocumentRealESSLCEPDF runs the parser against the real
// 2018 Chemistry First Round ESSLCE exam PDF committed under testdata/. It
// pins the expectations that matter for the admin review flow: every exam
// question parses, answers/explanations from the trailing "Answer key:"
// section merge in, and the page headers/footers stay out of the content.
// Skips when the fixture is absent so CI without the binary fixture still
// passes.
func TestParseQuestionsDocumentRealESSLCEPDF(t *testing.T) {
	const wantQuestions = 60
	path := filepath.Join("testdata", "esslce-2018-chemistry.pdf")
	content, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			t.Skip("real-exam fixture not present")
		}
		t.Fatalf("read fixture: %v", err)
	}

	questions, err := ParseQuestionsDocument("esslce-2018-chemistry.pdf", content)
	if err != nil {
		t.Fatalf("ParseQuestionsDocument: %v", err)
	}
	if len(questions) != wantQuestions {
		t.Fatalf("parsed %d questions, want %d", len(questions), wantQuestions)
	}

	// The answer key must have filled in the 1-based option index for every
	// question, and the explanation for every question that HAS one in the
	// key (the fixture's key omits explanations for these numbers).
	unanswered := []int{}
	explanationMissing := []int{}
	for i, q := range questions {
		if q.Answer < 1 {
			unanswered = append(unanswered, i+1)
		}
		if strings.TrimSpace(q.Explanation) == "" {
			explanationMissing = append(explanationMissing, i+1)
		}
	}
	if len(unanswered) > 0 {
		t.Fatalf("questions without a merged answer: %v", unanswered)
	}
	// 12/15/17/19/35/39/53/55/56 have no explanation in the fixture's key at
	// all; 57/59's formula-heavy explanations are drawn outside the
	// extractable text layer (rsc/pdf yields nothing for them — the AI+images
	// path is the remedy for such math).
	wantNoExplanation := map[int]bool{12: true, 15: true, 17: true, 19: true, 35: true, 39: true, 53: true, 55: true, 56: true, 57: true, 59: true}
	for _, n := range explanationMissing {
		if !wantNoExplanation[n] {
			t.Fatalf("question %d has no explanation but the fixture key provides one", n)
		}
	}
	if len(explanationMissing) != len(wantNoExplanation) {
		t.Fatalf("got %d questions without explanation, want exactly the %d the key omits", len(explanationMissing), len(wantNoExplanation))
	}

	// Spot-check content fidelity: q1 (options + known answer C=3) and the
	// bare-numbered q16 ("16 Consider ...", no dot after the number).
	if got := questions[0].QuestionText; !strings.HasPrefix(got, "The masses of different substances") {
		t.Fatalf("q1 text = %q", got)
	}
	if questions[0].Answer != 3 {
		t.Fatalf("q1 answer = %d, want 3 (C)", questions[0].Answer)
	}
	if len(questions[0].MultipleChoice) != 4 {
		t.Fatalf("q1 has %d options", len(questions[0].MultipleChoice))
	}
	if got := questions[15].QuestionText; !strings.HasPrefix(got, "Consider the following diagram") {
		t.Fatalf("q16 text = %q (the dot-less '16 Consider' line must still start a question)", got)
	}

	// Boilerplate from the page headers/footers must not leak into content.
	for i, q := range questions {
		for _, banned := range []string{"Download Entrance Tricks", "ESSLCE Online Exam"} {
			if strings.Contains(q.QuestionText, banned) {
				t.Fatalf("q%d question text contains boilerplate %q: %q", i+1, banned, q.QuestionText)
			}
			for _, c := range q.MultipleChoice {
				if strings.Contains(c, banned) {
					t.Fatalf("q%d option contains boilerplate %q: %q", i+1, banned, c)
				}
			}
		}
	}
}
