package usecase

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"victor-contest-go/internal/domain"
)

// fakeAiProviderRepo is an in-memory AiProviderRepository: handler/usecase
// tests never need a database.
type fakeAiProviderRepo struct {
	rows  map[string]domain.AIProvider
	order []string
}

func newFakeAiProviderRepo() *fakeAiProviderRepo {
	return &fakeAiProviderRepo{rows: map[string]domain.AIProvider{}}
}

func (f *fakeAiProviderRepo) seed(p domain.AIProvider) {
	if p.ID == "" {
		p.ID = fmt.Sprintf("id-%d", len(f.rows)+1)
	}
	if _, exists := f.rows[p.ID]; !exists {
		f.order = append(f.order, p.ID)
	}
	f.rows[p.ID] = p
}

func (f *fakeAiProviderRepo) AddProvider(p domain.AIProvider) (string, error) {
	f.seed(p)
	return p.ID, nil
}
func (f *fakeAiProviderRepo) UpdateProvider(p domain.AIProvider) error {
	f.seed(p)
	return nil
}
func (f *fakeAiProviderRepo) DeleteProvider(id string) error {
	delete(f.rows, id)
	return nil
}
func (f *fakeAiProviderRepo) GetProviderByID(id string) (*domain.AIProvider, error) {
	p, ok := f.rows[id]
	if !ok {
		return nil, nil
	}
	return &p, nil
}
func (f *fakeAiProviderRepo) GetAllProviders() ([]domain.AIProvider, error) {
	var out []domain.AIProvider
	for _, id := range f.order {
		if p, ok := f.rows[id]; ok {
			out = append(out, p)
		}
	}
	return out, nil
}

func TestPickEnabledProvider(t *testing.T) {
	tests := []struct {
		name string
		rows []domain.AIProvider
		want string // "" = nil
	}{
		{"no rows", nil, ""},
		{"all disabled", []domain.AIProvider{
			{ID: "a", Enabled: false, Models: []string{"m"}},
		}, ""},
		{"enabled without models skipped", []domain.AIProvider{
			{ID: "a", Enabled: true, CreatedAt: "2026-01-01T00:00:00Z"},
		}, ""},
		{"oldest created wins", []domain.AIProvider{
			{ID: "b", Enabled: true, CreatedAt: "2026-02-01T00:00:00Z", Models: []string{"m"}},
			{ID: "a", Enabled: true, CreatedAt: "2026-01-01T00:00:00Z", Models: []string{"m"}},
		}, "a"},
		{"tie broken by id", []domain.AIProvider{
			{ID: "z", Enabled: true, CreatedAt: "2026-01-01T00:00:00Z", Models: []string{"m"}},
			{ID: "y", Enabled: true, CreatedAt: "2026-01-01T00:00:00Z", Models: []string{"m"}},
		}, "y"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := pickEnabledProvider(tc.rows)
			if tc.want == "" {
				if got != nil {
					t.Fatalf("got %+v, want nil", got)
				}
				return
			}
			if got == nil || got.ID != tc.want {
				t.Fatalf("got %+v, want id %s", got, tc.want)
			}
		})
	}
}

func TestSelectProviderFallbackSemantics(t *testing.T) {
	t.Run("enabled provider row wins even without env key", func(t *testing.T) {
		t.Setenv("GOOGLE_API_KEY", "")
		repo := newFakeAiProviderRepo()
		repo.seed(domain.AIProvider{ID: "p", Name: "prov", Protocol: domain.AIProtocolOpenAI,
			BaseURL: "https://x.example", APIKey: "k", Models: []string{"m"}, Enabled: true, CreatedAt: "2026-01-01T00:00:00Z"})
		a := &aiUsecase{providerRepo: repo}
		p, model, err := a.selectProvider()
		if err != nil {
			t.Fatal(err)
		}
		if p.Protocol != domain.AIProtocolOpenAI || model != "m" {
			t.Fatalf("got %s/%s", p.Protocol, model)
		}
	})

	t.Run("no rows falls back to GOOGLE_API_KEY gemini", func(t *testing.T) {
		t.Setenv("GOOGLE_API_KEY", "env-key")
		a := &aiUsecase{providerRepo: newFakeAiProviderRepo()}
		p, model, err := a.selectProvider()
		if err != nil {
			t.Fatal(err)
		}
		if p.Protocol != domain.AIProtocolGemini || p.BaseURL != envFallbackBaseURL ||
			p.APIKey != "env-key" || model != envFallbackModel {
			t.Fatalf("fallback provider = %+v model %s", p, model)
		}
	})

	t.Run("rows exist but none enabled still falls back to env", func(t *testing.T) {
		t.Setenv("GOOGLE_API_KEY", "env-key")
		repo := newFakeAiProviderRepo()
		repo.seed(domain.AIProvider{ID: "p", Protocol: domain.AIProtocolOpenAI, Models: []string{"m"}, Enabled: false})
		a := &aiUsecase{providerRepo: repo}
		p, _, err := a.selectProvider()
		if err != nil || p.Protocol != domain.AIProtocolGemini {
			t.Fatalf("got %+v err %v, want env fallback", p, err)
		}
	})

	t.Run("no provider and no env key is a clear error", func(t *testing.T) {
		t.Setenv("GOOGLE_API_KEY", "")
		a := &aiUsecase{providerRepo: newFakeAiProviderRepo()}
		_, _, err := a.selectProvider()
		if err == nil || err.Error() != "no enabled AI provider configured and GOOGLE_API_KEY is not set" {
			t.Fatalf("err = %v", err)
		}
	})
}

// PracticeWithAi must flow through the selected provider's protocol adapter:
// a gemini provider row pointing at a local httptest server.
func TestPracticeWithAiUsesSelectedProvider(t *testing.T) {
	t.Setenv("GOOGLE_API_KEY", "")
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		inner := `[{"question_text":"q","multiple_choice":["a","b","c","d"],"answer":0,"explanation":"e","subject":"Math","grade":"9","chapter":"c1"}]`
		enc, _ := json.Marshal(inner)
		io.WriteString(w, `{"candidates":[{"content":{"parts":[{"text":`+string(enc)+`}]}}]}`)
	}))
	defer srv.Close()

	repo := newFakeAiProviderRepo()
	repo.seed(domain.AIProvider{ID: "p", Name: "local-gemini", Protocol: domain.AIProtocolGemini,
		BaseURL: srv.URL, APIKey: "k", Models: []string{"gemini-local"}, Enabled: true, CreatedAt: "2026-01-01T00:00:00Z"})
	a := NewAiUsecase(nil, repo)

	qs, err := a.PracticeWithAi(domain.AiPracticeSetting{Subject: "Math", Topic: "Algebra", Difficulty: "easy"})
	if err != nil {
		t.Fatalf("PracticeWithAi: %v", err)
	}
	if len(*qs) != 1 || (*qs)[0].QuestionText != "q" {
		t.Fatalf("questions = %+v", *qs)
	}
	if gotPath != "/v1beta/models/gemini-local:generateContent" {
		t.Fatalf("provider was not called through the gemini adapter: path %s", gotPath)
	}
}
