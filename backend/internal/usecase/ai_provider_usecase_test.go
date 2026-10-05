package usecase

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"victory-contest-go/internal/domain"
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
			{ID: "a", Enabled: false, Models: domain.ModelList{ {Name: "m"} }},
		}, ""},
		{"enabled without models skipped", []domain.AIProvider{
			{ID: "a", Enabled: true, CreatedAt: "2026-01-01T00:00:00Z"},
		}, ""},
		{"oldest created wins", []domain.AIProvider{
			{ID: "b", Enabled: true, CreatedAt: "2026-02-01T00:00:00Z", Models: domain.ModelList{ {Name: "m"} }},
			{ID: "a", Enabled: true, CreatedAt: "2026-01-01T00:00:00Z", Models: domain.ModelList{ {Name: "m"} }},
		}, "a"},
		{"tie broken by id", []domain.AIProvider{
			{ID: "z", Enabled: true, CreatedAt: "2026-01-01T00:00:00Z", Models: domain.ModelList{ {Name: "m"} }},
			{ID: "y", Enabled: true, CreatedAt: "2026-01-01T00:00:00Z", Models: domain.ModelList{ {Name: "m"} }},
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
			BaseURL: "https://x.example", APIKey: "k", Models: domain.ModelList{ {Name: "m"} }, Enabled: true, CreatedAt: "2026-01-01T00:00:00Z"})
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
		repo.seed(domain.AIProvider{ID: "p", Protocol: domain.AIProtocolOpenAI, Models: domain.ModelList{ {Name: "m"} }, Enabled: false})
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
		BaseURL: srv.URL, APIKey: "k", Models: domain.ModelList{ {Name: "gemini-local"} }, Enabled: true, CreatedAt: "2026-01-01T00:00:00Z"})
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

// pickProvider is the full selection order: default (enabled, ≥1 model)
// first, else the oldest-enabled rule.
func TestPickProviderDefaultOrder(t *testing.T) {
	old := domain.AIProvider{ID: "old", Enabled: true, CreatedAt: "2026-01-01T00:00:00Z", Models: domain.ModelList{ {Name: "m"} }}
	tests := []struct {
		name string
		rows []domain.AIProvider
		want string // "" = nil
	}{
		{"no default keeps oldest-enabled", []domain.AIProvider{
			{ID: "new", Enabled: true, CreatedAt: "2026-03-01T00:00:00Z", Models: domain.ModelList{ {Name: "m"} }},
			old,
		}, "old"},
		{"default wins even when newest", []domain.AIProvider{
			old,
			{ID: "new", Enabled: true, CreatedAt: "2026-03-01T00:00:00Z", Models: domain.ModelList{ {Name: "m"} }, IsDefault: true},
		}, "new"},
		{"disabled default falls back to oldest enabled", []domain.AIProvider{
			old,
			{ID: "new", Enabled: false, CreatedAt: "2026-03-01T00:00:00Z", Models: domain.ModelList{ {Name: "m"} }, IsDefault: true},
		}, "old"},
		{"default without models is not honored", []domain.AIProvider{
			old,
			{ID: "new", Enabled: true, CreatedAt: "2026-03-01T00:00:00Z", IsDefault: true},
		}, "old"},
		{"torn double default resolves to earliest created", []domain.AIProvider{
			{ID: "b", Enabled: true, CreatedAt: "2026-02-01T00:00:00Z", Models: domain.ModelList{ {Name: "m"} }, IsDefault: true},
			{ID: "a", Enabled: true, CreatedAt: "2026-01-01T00:00:00Z", Models: domain.ModelList{ {Name: "m"} }, IsDefault: true},
		}, "a"},
		{"nothing usable", []domain.AIProvider{
			{ID: "x", Enabled: false, Models: domain.ModelList{ {Name: "m"} }, IsDefault: true},
		}, ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := pickProvider(tc.rows)
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

func TestModelFor(t *testing.T) {
	p := &domain.AIProvider{Models: domain.ModelList{ {Name: "a"}, {Name: "b"} }}
	if got := modelFor(p); got != "a" {
		t.Fatalf("no pin: got %s, want a", got)
	}
	p.DefaultModel = "b"
	if got := modelFor(p); got != "b" {
		t.Fatalf("pin: got %s, want b", got)
	}
	p.DefaultModel = "gone" // stale pin after a models edit → first model
	if got := modelFor(p); got != "a" {
		t.Fatalf("stale pin: got %s, want a", got)
	}
}

// selectProvider honors the default row AND its pinned model.
func TestSelectProviderPrefersDefault(t *testing.T) {
	t.Setenv("GOOGLE_API_KEY", "")
	repo := newFakeAiProviderRepo()
	repo.seed(domain.AIProvider{ID: "old", Name: "old", Protocol: domain.AIProtocolOpenAI,
		BaseURL: "https://old.example", APIKey: "k", Models: domain.ModelList{ {Name: "m"} }, Enabled: true, CreatedAt: "2026-01-01T00:00:00Z"})
	repo.seed(domain.AIProvider{ID: "def", Name: "def", Protocol: domain.AIProtocolOpenAI,
		BaseURL: "https://def.example", APIKey: "k", Models: domain.ModelList{ {Name: "x"}, {Name: "y"} }, Enabled: true,
		CreatedAt: "2026-05-01T00:00:00Z", IsDefault: true, DefaultModel: "y"})
	a := &aiUsecase{providerRepo: repo}
	p, model, err := a.selectProvider()
	if err != nil {
		t.Fatal(err)
	}
	if p.ID != "def" || model != "y" {
		t.Fatalf("got %s/%s, want def/y", p.ID, model)
	}
}

// SetDefaultProvider keeps exactly one default row; ClearDefaultProvider
// unsets; the pinned model must belong to the provider.
func TestSetClearDefaultProvider(t *testing.T) {
	repo := newFakeAiProviderRepo()
	repo.seed(domain.AIProvider{ID: "a", Enabled: true, Models: domain.ModelList{ {Name: "m1"}, {Name: "m2"} }, CreatedAt: "2026-01-01T00:00:00Z"})
	repo.seed(domain.AIProvider{ID: "b", Enabled: true, Models: domain.ModelList{ {Name: "mx"} }, CreatedAt: "2026-02-01T00:00:00Z"})
	u := NewAiProviderUsecase(repo)

	if err := u.SetDefaultProvider("a", "m2"); err != nil {
		t.Fatal(err)
	}
	if !repo.rows["a"].IsDefault || repo.rows["a"].DefaultModel != "m2" {
		t.Fatalf("a = %+v", repo.rows["a"])
	}
	// Re-tag b: a must lose the flag.
	if err := u.SetDefaultProvider("b", ""); err != nil {
		t.Fatal(err)
	}
	rows, _ := repo.GetAllProviders()
	n := 0
	for _, p := range rows {
		if p.IsDefault {
			n++
			if p.ID != "b" || p.DefaultModel != "" {
				t.Fatalf("unexpected default: %+v", p)
			}
		}
	}
	if n != 1 {
		t.Fatalf("defaults = %d, want exactly 1", n)
	}
	if repo.rows["a"].IsDefault || repo.rows["a"].DefaultModel != "" {
		t.Fatalf("old default not cleared: %+v", repo.rows["a"])
	}

	// Unknown model → input error; nothing moved.
	if err := u.SetDefaultProvider("a", "nope"); !IsProviderInputError(err) {
		t.Fatalf("bad model err = %v, want input error", err)
	}
	if repo.rows["a"].IsDefault {
		t.Fatal("rejected call must not flip the flag")
	}
	// Unknown id → wrapped ErrProviderNotFound.
	if err := u.SetDefaultProvider("zz", ""); !errors.Is(err, ErrProviderNotFound) || !IsProviderInputError(err) {
		t.Fatalf("unknown id err = %v", err)
	}
	// Clear + idempotency.
	if err := u.ClearDefaultProvider("b"); err != nil {
		t.Fatal(err)
	}
	if repo.rows["b"].IsDefault {
		t.Fatal("clear did not apply")
	}
	if err := u.ClearDefaultProvider("b"); err != nil {
		t.Fatalf("second clear should be idempotent: %v", err)
	}
	if err := u.ClearDefaultProvider("zz"); !errors.Is(err, ErrProviderNotFound) {
		t.Fatalf("clear unknown id err = %v", err)
	}
}

// A regular UpdateProvider (PUT path) must never move or wipe the default.
func TestUpdateProviderPreservesDefaultFields(t *testing.T) {
	repo := newFakeAiProviderRepo()
	repo.seed(domain.AIProvider{ID: "a", Name: "a", Enabled: true, Models: domain.ModelList{ {Name: "m1"}, {Name: "m2"} },
		BaseURL: "https://a.example", Protocol: domain.AIProtocolOpenAI, APIKey: "k",
		IsDefault: true, DefaultModel: "m2"})
	u := NewAiProviderUsecase(repo)
	err := u.UpdateProvider("a", domain.AIProvider{Name: "renamed", BaseURL: "https://b.example",
		Protocol: domain.AIProtocolOpenAI, Models: domain.ModelList{ {Name: "m1"}, {Name: "m2"} }, Enabled: true})
	if err != nil {
		t.Fatal(err)
	}
	if !repo.rows["a"].IsDefault || repo.rows["a"].DefaultModel != "m2" {
		t.Fatalf("PUT wiped default: %+v", repo.rows["a"])
	}
}
