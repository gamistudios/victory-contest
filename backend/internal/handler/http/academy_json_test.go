package http

import (
	"encoding/json"
	"strings"
	"testing"

	"victory-contest-go/internal/domain"

	"github.com/gin-gonic/gin"
)

func academyMarshal(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(academySafe(v))
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return string(b)
}

// The client contract types these fields as arrays, so a nil must never reach the
// wire as `null`: `card.tags.map(...)` / `q.correct_answers.length` would throw.
func TestAcademySafeReplacesNilCollections(t *testing.T) {
	m := domain.AcademyModule{
		ID: "mod-1",
		FlashcardDeck: []domain.AcademyFlashcard{
			{ID: "fc-1", Question: "q", Answer: "a"}, // Tags nil
		},
		Quiz: &domain.AcademyModuleQuiz{
			ID:        "quiz-1",
			Questions: []domain.AcademyQuizQuestion{{ID: "q-1", Type: "multiple_choice", Question: "q"}}, // Options/CorrectAnswers nil
		},
		VideoLesson: &domain.AcademyVideoLesson{ID: "v-1", Title: "t"}, // Transcript nil
	}
	got := academyMarshal(t, m)
	for _, want := range []string{`"tags":[]`, `"correct_answers":[]`, `"transcript":[]`, `"learning_objectives":[]`, `"document_attachments":[]`, `"flashcard_deck":[`, `"resources":[]`, `"resource_access":{}`} {
		if !strings.Contains(got, want) {
			t.Errorf("response missing %s\n got %s", want, got)
		}
	}
	if strings.Contains(got, `"tags":null`) || strings.Contains(got, `"correct_answers":null`) || strings.Contains(got, `"transcript":null`) {
		t.Errorf("null leaked where a list is required: %s", got)
	}
}

func TestAcademySafeChapterAndState(t *testing.T) {
	ch := academyMarshal(t, domain.AcademyChapter{ID: "ch-1", Title: "t"})
	if !strings.Contains(ch, `"module_ids":[]`) {
		t.Errorf("chapter module_ids should be [], got %s", ch)
	}
	st := academyMarshal(t, domain.AcademyStudentState{
		StudentID:    "123",
		QuizAttempts: []domain.AcademyQuizAttempt{{ID: "qa-1"}}, // WeakTopics nil
		FlashcardProgress: map[string]domain.AcademyFlashcardProgress{
			"mod-1": {DeckModuleID: "mod-1"}, // Mastered/Struggling nil
		},
	})
	for _, want := range []string{`"weak_topics":[]`, `"mastered_ids":[]`, `"struggling_ids":[]`} {
		if !strings.Contains(st, want) {
			t.Errorf("state missing %s, got %s", want, st)
		}
	}
}

// Wrappers the handlers actually send, plus the cases that must not change.
func TestAcademySafeKeepsEverythingElse(t *testing.T) {
	got := academyMarshal(t, gin.H{"programs": []domain.AcademyProgram{{ID: "gr12"}, {ID: "gr11"}}})
	if !strings.Contains(got, `"available_streams":[]`) {
		t.Errorf("wrapped list should be normalized: %s", got)
	}

	// []byte keeps its null, absent optional lists stay absent, nil pointers stay null.
	raw := academyMarshal(t, domain.AcademyAiDraft{ID: "d-1", ModuleID: "mod-1"})
	if strings.Contains(raw, `"flashcards"`) || strings.Contains(raw, `"questions"`) {
		t.Errorf("omitempty drafts should stay omitted: %s", raw)
	}
	if academyMarshal(t, map[string][]byte{"blob": nil}) != `{"blob":null}` {
		t.Errorf("[]byte must keep null semantics")
	}
	if academyMarshal(t, map[string]*domain.AcademyModuleQuiz{"quiz": nil}) != `{"quiz":null}` {
		t.Errorf("nil pointer must stay null")
	}

	// Values survive the copy unchanged.
	withData := domain.AcademyModule{ID: "mod-2", LearningObjectives: []string{"a", "b"},
		FlashcardDeck: []domain.AcademyFlashcard{{ID: "fc", Tags: []string{"x"}}}}
	round := academyMarshal(t, withData)
	if !strings.Contains(round, `"learning_objectives":["a","b"]`) || !strings.Contains(round, `"tags":["x"]`) {
		t.Errorf("data changed by the guard: %s", round)
	}

	// Defensive: a nil body and non-struct payloads must not panic.
	if academySafe(nil) != nil || !strings.Contains(academyMarshal(t, []string{"a"}), `["a"]`) {
		t.Errorf("scalar/slice payloads should pass through")
	}
	if academyMarshal(t, 42) != "42" {
		t.Errorf("numbers should pass through")
	}
}
