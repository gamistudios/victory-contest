package http

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
	"victor-contest-go/internal/domain"
	"victor-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// adminTestRepo is an in-memory AiProviderRepository for route-level tests.
type adminTestRepo struct {
	rows map[string]domain.AIProvider
	n    int
}

func (r *adminTestRepo) AddProvider(p domain.AIProvider) (string, error) {
	if p.ID == "" {
		r.n++
		p.ID = fmt.Sprintf("prov-%d", r.n)
	}
	if p.CreatedAt == "" {
		p.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	p.UpdatedAt = p.CreatedAt
	r.rows[p.ID] = p
	return p.ID, nil
}
func (r *adminTestRepo) UpdateProvider(p domain.AIProvider) error {
	r.rows[p.ID] = p
	return nil
}
func (r *adminTestRepo) DeleteProvider(id string) error { delete(r.rows, id); return nil }
func (r *adminTestRepo) GetProviderByID(id string) (*domain.AIProvider, error) {
	p, ok := r.rows[id]
	if !ok {
		return nil, nil
	}
	return &p, nil
}
func (r *adminTestRepo) GetAllProviders() ([]domain.AIProvider, error) {
	var out []domain.AIProvider
	for _, p := range r.rows {
		out = append(out, p)
	}
	return out, nil
}

const aiAdminSecret = "test-secret"

func newAiAdminTestServer(t *testing.T) (*gin.Engine, *adminTestRepo) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	repo := &adminTestRepo{rows: map[string]domain.AIProvider{}}
	h := NewAiAdminHandler(usecase.NewAiProviderUsecase(repo))
	r := gin.New()
	h.RegisterRoutes(r.Group("/api/ai-admin"), adminAuth([]byte(aiAdminSecret)))
	return r, repo
}

func directCookie(t *testing.T) *http.Cookie {
	t.Helper()
	return &http.Cookie{Name: "token", Value: signToken(t, []byte(aiAdminSecret), "admin@x.et", time.Now().Add(time.Hour))}
}

func doReq(r *gin.Engine, method, path string, body io.Reader, cookie *http.Cookie) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, body)
	req.Header.Set("Content-Type", "application/json")
	if cookie != nil {
		req.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// (a) every admin AI route answers 401 without a valid admin cookie.
func TestAiAdminRoutesRequireAuth(t *testing.T) {
	r, _ := newAiAdminTestServer(t)
	validBody := `{"name":"n","base_url":"https://api.example.com","api_key":"sk-x","protocol":"openai","models":["m"]}`
	tests := []struct{ method, path, body string }{
		{http.MethodGet, "/api/ai-admin/providers", ""},
		{http.MethodGet, "/api/ai-admin/providers/some-id", ""},
		{http.MethodPost, "/api/ai-admin/providers", validBody},
		{http.MethodPut, "/api/ai-admin/providers/some-id", validBody},
		{http.MethodDelete, "/api/ai-admin/providers/some-id", ""},
		{http.MethodPost, "/api/ai-admin/providers/some-id/test", ""},
	}
	for _, tc := range tests {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			var body io.Reader
			if tc.body != "" {
				body = strings.NewReader(tc.body)
			}
			w := doReq(r, tc.method, tc.path, body, nil)
			if w.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want 401 (body %s)", w.Code, w.Body.String())
			}
		})
	}
}

const leakyKey = "sk-LEAKCHECK-abcdefghij9876"

// (b) a created provider's api_key never appears in ANY response body; the
// list view only exposes the last-4 hint.
func TestAiAdminCreateAndListNeverLeakAPIKey(t *testing.T) {
	r, repo := newAiAdminTestServer(t)
	cookie := directCookie(t)

	body := fmt.Sprintf(`{"name":"main","base_url":"https://api.example.com/v1","api_key":%q,"protocol":"openai","models":["gpt-x"]}`, leakyKey)
	w := doReq(r, http.MethodPost, "/api/ai-admin/providers", strings.NewReader(body), cookie)
	if w.Code != http.StatusOK {
		t.Fatalf("create status = %d, body %s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), leakyKey) {
		t.Fatalf("create response leaked key: %s", w.Body.String())
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created.ID == "" {
		t.Fatalf("bad create response: %s (%v)", w.Body.String(), err)
	}
	// The key IS persisted server-side (that's the point), just never emitted.
	if repo.rows[created.ID].APIKey != leakyKey {
		t.Fatalf("key not persisted: %q", repo.rows[created.ID].APIKey)
	}

	for _, path := range []string{"/api/ai-admin/providers", "/api/ai-admin/providers/" + created.ID} {
		w := doReq(r, http.MethodGet, path, nil, cookie)
		if w.Code != http.StatusOK {
			t.Fatalf("GET %s status = %d", path, w.Code)
		}
		if strings.Contains(w.Body.String(), leakyKey) {
			t.Fatalf("GET %s leaked key: %s", path, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), "9876") {
			t.Fatalf("GET %s missing last-4 hint: %s", path, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), `"has_api_key":true`) {
			t.Fatalf("GET %s missing has_api_key: %s", path, w.Body.String())
		}
	}
}

// (c) unknown protocol and bad base URLs are rejected with 400.
func TestAiAdminValidation(t *testing.T) {
	r, _ := newAiAdminTestServer(t)
	cookie := directCookie(t)
	tests := []struct {
		name  string
		body  string
		want  int
		wants string // substring of the error
	}{
		{"unknown protocol",
			`{"name":"n","base_url":"https://a.example","api_key":"k","protocol":"ollama","models":["m"]}`,
			400, "protocol"},
		{"missing name",
			`{"base_url":"https://a.example","api_key":"k","protocol":"openai","models":["m"]}`,
			400, "name"},
		{"no models",
			`{"name":"n","base_url":"https://a.example","api_key":"k","protocol":"gemini","models":[]}`,
			400, "model"},
		{"missing key",
			`{"name":"n","base_url":"https://a.example","api_key":"","protocol":"gemini","models":["m"]}`,
			400, "api_key"},
		{"plaintext http to a remote host",
			fmt.Sprintf(`{"name":"n","base_url":"http://api.example.com","api_key":%q,"protocol":"openai","models":["m"]}`, leakyKey),
			400, "https"},
		{"embedded credentials",
			`{"name":"n","base_url":"https://user:pass@api.example.com","api_key":"k","protocol":"openai","models":["m"]}`,
			400, "credentials"},
		{"non-url",
			`{"name":"n","base_url":"not a url","api_key":"k","protocol":"openai","models":["m"]}`,
			400, "base_url"},
		{"localhost http is allowed",
			`{"name":"n","base_url":"http://127.0.0.1:8010/v1","api_key":"k","protocol":"openai","models":["m"]}`,
			200, ""},
		{"valid gemini",
			`{"name":"n","base_url":"https://generativelanguage.googleapis.com","api_key":"k","protocol":"gemini","models":["gemini-x"]}`,
			200, ""},
		{"valid anthropic",
			`{"name":"n","base_url":"https://api.anthropic.com","api_key":"k","protocol":"anthropic","models":["claude-x"]}`,
			200, ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			w := doReq(r, http.MethodPost, "/api/ai-admin/providers", strings.NewReader(tc.body), cookie)
			if w.Code != tc.want {
				t.Fatalf("status = %d, want %d (body %s)", w.Code, tc.want, w.Body.String())
			}
			if tc.wants != "" && !strings.Contains(w.Body.String(), tc.wants) {
				t.Fatalf("body %s should mention %q", w.Body.String(), tc.wants)
			}
			if strings.Contains(w.Body.String(), leakyKey) {
				t.Fatalf("response leaked key: %s", w.Body.String())
			}
		})
	}
}

func TestAiAdminUpdateKeepsStoredKeyAndEnabledFlag(t *testing.T) {
	r, repo := newAiAdminTestServer(t)
	cookie := directCookie(t)
	body := fmt.Sprintf(`{"name":"old","base_url":"https://api.example.com","api_key":%q,"protocol":"openai","models":["m"],"enabled":false}`, leakyKey)
	w := doReq(r, http.MethodPost, "/api/ai-admin/providers", strings.NewReader(body), cookie)
	var created struct{ ID string }
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}

	// PUT without api_key and without enabled: key stays, enabled flag stays.
	put := `{"name":"new","base_url":"https://api2.example.com","protocol":"anthropic","models":["claude"]}`
	w = doReq(r, http.MethodPut, "/api/ai-admin/providers/"+created.ID, strings.NewReader(put), cookie)
	if w.Code != http.StatusOK {
		t.Fatalf("update status = %d body %s", w.Code, w.Body.String())
	}
	stored := repo.rows[created.ID]
	if stored.APIKey != leakyKey {
		t.Fatalf("stored key was wiped: %q", stored.APIKey)
	}
	if stored.Enabled != false {
		t.Fatal("omitted enabled must keep stored false")
	}
	if stored.Name != "new" || stored.Protocol != "anthropic" {
		t.Fatalf("update did not apply: %+v", stored)
	}
	if strings.Contains(w.Body.String(), leakyKey) {
		t.Fatalf("update response leaked key: %s", w.Body.String())
	}

	// PUT unknown protocol -> 400
	w = doReq(r, http.MethodPut, "/api/ai-admin/providers/"+created.ID,
		strings.NewReader(`{"name":"x","base_url":"https://api2.example.com","protocol":"bogus","models":["m"]}`), cookie)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("bad protocol update status = %d", w.Code)
	}

	// PUT unknown id -> 404
	w = doReq(r, http.MethodPut, "/api/ai-admin/providers/nope",
		strings.NewReader(`{"name":"x","base_url":"https://api2.example.com","protocol":"openai","models":["m"]}`), cookie)
	if w.Code != http.StatusNotFound {
		t.Fatalf("unknown id update status = %d", w.Code)
	}
}

func TestAiAdminDelete(t *testing.T) {
	r, repo := newAiAdminTestServer(t)
	cookie := directCookie(t)
	body := `{"name":"n","base_url":"https://api.example.com","api_key":"k","protocol":"openai","models":["m"]}`
	w := doReq(r, http.MethodPost, "/api/ai-admin/providers", strings.NewReader(body), cookie)
	var created struct{ ID string }
	json.Unmarshal(w.Body.Bytes(), &created)

	w = doReq(r, http.MethodDelete, "/api/ai-admin/providers/"+created.ID, nil, cookie)
	if w.Code != http.StatusOK {
		t.Fatalf("delete status = %d", w.Code)
	}
	if _, ok := repo.rows[created.ID]; ok {
		t.Fatal("row survived delete")
	}
}

// (4) POST /providers/:id/test: a green provider reports ok with a masked
// sample; a failing one reports ok:false and NEVER echoes the key.
func TestAiAdminTestProviderEndpoint(t *testing.T) {
	cookieKey := "sk-PROBEKEY-0000abcd"

	t.Run("success", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			io.WriteString(w, `{"choices":[{"message":{"content":"PONG"}}]}`)
		}))
		defer srv.Close()
		r, _ := newAiAdminTestServer(t)
		body := fmt.Sprintf(`{"name":"probe","base_url":%q,"api_key":%q,"protocol":"openai","models":["m"]}`, srv.URL, cookieKey)
		w := doReq(r, http.MethodPost, "/api/ai-admin/providers", strings.NewReader(body), directCookie(t))
		var created struct{ ID string }
		json.Unmarshal(w.Body.Bytes(), &created)

		w = doReq(r, http.MethodPost, "/api/ai-admin/providers/"+created.ID+"/test", nil, directCookie(t))
		if w.Code != http.StatusOK {
			t.Fatalf("test status = %d body %s", w.Code, w.Body.String())
		}
		var res usecase.ProviderTestResult
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatal(err)
		}
		if !res.OK || !strings.Contains(res.Message, "PONG") {
			t.Fatalf("res = %+v", res)
		}
		if strings.Contains(w.Body.String(), cookieKey) {
			t.Fatalf("test response leaked key: %s", w.Body.String())
		}
	})

	t.Run("failure is masked", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
			b, _ := json.Marshal(map[string]any{"error": map[string]string{"message": "bad key " + cookieKey}})
			w.Write(b)
		}))
		defer srv.Close()
		r, _ := newAiAdminTestServer(t)
		body := fmt.Sprintf(`{"name":"probe","base_url":%q,"api_key":%q,"protocol":"openai","models":["m"]}`, srv.URL, cookieKey)
		w := doReq(r, http.MethodPost, "/api/ai-admin/providers", strings.NewReader(body), directCookie(t))
		var created struct{ ID string }
		json.Unmarshal(w.Body.Bytes(), &created)

		w = doReq(r, http.MethodPost, "/api/ai-admin/providers/"+created.ID+"/test", nil, directCookie(t))
		if w.Code != http.StatusOK {
			t.Fatalf("probe endpoint should 200 with ok=false, got %d", w.Code)
		}
		if strings.Contains(w.Body.String(), cookieKey) {
			t.Fatalf("masked failure leaked key: %s", w.Body.String())
		}
		var res usecase.ProviderTestResult
		json.Unmarshal(w.Body.Bytes(), &res)
		if res.OK || !strings.Contains(res.Message, "401") {
			t.Fatalf("res = %+v", res)
		}
	})

	t.Run("unknown id 404s", func(t *testing.T) {
		r, _ := newAiAdminTestServer(t)
		w := doReq(r, http.MethodPost, "/api/ai-admin/providers/nope/test", nil, directCookie(t))
		if w.Code != http.StatusNotFound {
			t.Fatalf("status = %d, want 404", w.Code)
		}
	})
}
