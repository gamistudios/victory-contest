package usecase

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"victory-contest-go/internal/domain"
)

// All wire-adapter tests run against local httptest servers — no real
// network, no paid APIs, and the fake keys below exist only in-process.

const testAPIKey = "sk-TESTKEY-0123456789abcdef"

func testProvider(baseURL, protocol string, models ...string) domain.AIProvider {
	return domain.AIProvider{
		ID: "p1", Name: "test-" + protocol, BaseURL: baseURL,
		APIKey: testAPIKey, Protocol: protocol,
		Models: models, Enabled: true,
	}
}

// --- request builder unit tests (pure, no server) ---

func TestBuildOpenAIRequestShape(t *testing.T) {
	req := completionRequest{prompt: "hello"}
	httpReq, parse, err := buildOpenAIRequest(context.Background(),
		testProvider("https://api.example.com/v1", domain.AIProtocolOpenAI, "gpt-x"), "gpt-x", req)
	if err != nil {
		t.Fatalf("buildOpenAIRequest: %v", err)
	}
	if parse == nil {
		t.Fatal("nil parser")
	}
	if got := httpReq.URL.String(); got != "https://api.example.com/v1/chat/completions" {
		t.Errorf("url = %s", got)
	}
	if got := httpReq.Header.Get("Authorization"); got != "Bearer "+testAPIKey {
		t.Errorf("Authorization = %q", got)
	}
	if httpReq.Method != http.MethodPost {
		t.Errorf("method = %s", httpReq.Method)
	}
	body := decodeBody(t, httpReq)
	if body["model"] != "gpt-x" {
		t.Errorf("model = %v", body["model"])
	}
	if _, ok := body["max_tokens"]; ok {
		t.Error("max_tokens must be omitted when unset")
	}
	msgs, ok := body["messages"].([]any)
	if !ok || len(msgs) != 1 {
		t.Fatalf("messages = %v", body["messages"])
	}
	m := msgs[0].(map[string]any)
	if m["role"] != "user" || m["content"] != "hello" {
		t.Errorf("message = %v", m)
	}
}

func TestBuildAnthropicRequestShape(t *testing.T) {
	httpReq, _, err := buildAnthropicRequest(context.Background(),
		testProvider("https://api.anthropic.com", domain.AIProtocolAnthropic, "claude-x"), "claude-x",
		completionRequest{prompt: "hi"})
	if err != nil {
		t.Fatalf("buildAnthropicRequest: %v", err)
	}
	if got := httpReq.URL.String(); got != "https://api.anthropic.com/v1/messages" {
		t.Errorf("url = %s", got)
	}
	if got := httpReq.Header.Get("x-api-key"); got != testAPIKey {
		t.Errorf("x-api-key = %q", got)
	}
	if got := httpReq.Header.Get("anthropic-version"); got != "2023-06-01" {
		t.Errorf("anthropic-version = %q", got)
	}
	body := decodeBody(t, httpReq)
	// max_tokens is REQUIRED by the Messages API; the default applies.
	if mt, ok := body["max_tokens"].(float64); !ok || int(mt) != anthropicDefaultMaxTokens {
		t.Errorf("max_tokens = %v, want default %d", body["max_tokens"], anthropicDefaultMaxTokens)
	}
}

func TestAnthropicBaseURLWithV1SuffixIsNotDoubled(t *testing.T) {
	// Users paste base URLs ending in /v1 all the time (ScoOS clients strip it).
	for _, base := range []string{"https://gw.example/v1", "https://gw.example/v1/"} {
		if got := anthropicMessagesURL(base); got != "https://gw.example/v1/messages" {
			t.Errorf("anthropicMessagesURL(%q) = %s", base, got)
		}
	}
}

func TestBuildGeminiRequestShape(t *testing.T) {
	httpReq, _, err := buildGeminiRequest(context.Background(),
		testProvider("https://generativelanguage.googleapis.com", domain.AIProtocolGemini, "gemini-2.5-flash"),
		"gemini-2.5-flash", completionRequest{prompt: "ping", maxTokens: 64})
	if err != nil {
		t.Fatalf("buildGeminiRequest: %v", err)
	}
	if got := httpReq.URL.String(); got != "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" {
		t.Errorf("url = %s", got)
	}
	// Key travels in a header, never in the query string.
	if httpReq.URL.RawQuery != "" {
		t.Errorf("query = %q, want empty (key must not ride in URLs)", httpReq.URL.RawQuery)
	}
	if got := httpReq.Header.Get("x-goog-api-key"); got != testAPIKey {
		t.Errorf("x-goog-api-key = %q", got)
	}
	body := decodeBody(t, httpReq)
	contents, ok := body["contents"].([]any)
	if !ok || len(contents) != 1 {
		t.Fatalf("contents = %v", body["contents"])
	}
	c0 := contents[0].(map[string]any)
	parts := c0["parts"].([]any)
	if parts[0].(map[string]any)["text"] != "ping" {
		t.Errorf("parts = %v", parts)
	}
	if gc, ok := body["generationConfig"].(map[string]any); !ok || gc["maxOutputTokens"].(float64) != 64 {
		t.Errorf("generationConfig = %v", body["generationConfig"])
	}
}

// --- response parser unit tests ---

func TestResponseParsers(t *testing.T) {
	tests := []struct {
		name    string
		parse   func([]byte) (string, error)
		body    string
		want    string
		wantErr string
	}{
		{"openai ok", parseOpenAIResponse,
			`{"choices":[{"message":{"content":"answer"}}]}`, "answer", ""},
		{"openai no choices", parseOpenAIResponse, `{"choices":[]}`, "", "no choices"},
		{"openai garbage", parseOpenAIResponse, `not json`, "", "parse openai response"},
		{"anthropic joins text blocks", parseAnthropicResponse,
			`{"content":[{"type":"thinking","text":"zzz"},{"type":"text","text":"a"},{"type":"text","text":"b"}]}`, "ab", ""},
		{"anthropic no text", parseAnthropicResponse, `{"content":[]}`, "", "no text blocks"},
		{"gemini joins parts", parseGeminiResponse,
			`{"candidates":[{"content":{"parts":[{"text":"x"},{"text":"y"}]}}]}`, "xy", ""},
		{"gemini no candidates", parseGeminiResponse, `{"candidates":[]}`, "", "no candidates"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := tc.parse([]byte(tc.body))
			if tc.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
					t.Fatalf("err = %v, want substring %q", err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}

// --- end-to-end round trips against local httptest servers ---

func TestCompleteProviderRoundTrips(t *testing.T) {
	tests := []struct {
		name     string
		protocol string
		// handler asserts the wire shape the real provider would see and
		// replies with a protocol-correct body.
		handler  func(t *testing.T, wantPrompt string) http.HandlerFunc
		response string
		wantText string
	}{
		{
			name:     "openai chat completions",
			protocol: domain.AIProtocolOpenAI,
			handler: func(t *testing.T, wantPrompt string) http.HandlerFunc {
				return func(w http.ResponseWriter, r *http.Request) {
					if r.URL.Path != "/chat/completions" {
						t.Errorf("path = %s", r.URL.Path)
					}
					if got := r.Header.Get("Authorization"); got != "Bearer "+testAPIKey {
						t.Errorf("Authorization = %q", got)
					}
					body := decodeBody(t, r)
					if body["messages"].([]any)[0].(map[string]any)["content"] != wantPrompt {
						t.Errorf("prompt mismatch: %v", body["messages"])
					}
					w.Header().Set("Content-Type", "application/json")
					io.WriteString(w, `{"choices":[{"message":{"content":"OPENAI-REPLY"}}]}`)
				}
			},
			wantText: "OPENAI-REPLY",
		},
		{
			name:     "anthropic messages",
			protocol: domain.AIProtocolAnthropic,
			handler: func(t *testing.T, wantPrompt string) http.HandlerFunc {
				return func(w http.ResponseWriter, r *http.Request) {
					if r.URL.Path != "/v1/messages" {
						t.Errorf("path = %s", r.URL.Path)
					}
					if r.Header.Get("x-api-key") != testAPIKey || r.Header.Get("anthropic-version") != "2023-06-01" {
						t.Errorf("auth headers = %v", r.Header)
					}
					w.Header().Set("Content-Type", "application/json")
					io.WriteString(w, `{"content":[{"type":"text","text":"ANTHROPIC-REPLY"}]}`)
				}
			},
			wantText: "ANTHROPIC-REPLY",
		},
		{
			name:     "gemini generateContent",
			protocol: domain.AIProtocolGemini,
			handler: func(t *testing.T, wantPrompt string) http.HandlerFunc {
				return func(w http.ResponseWriter, r *http.Request) {
					if r.URL.Path != "/v1beta/models/gemini-test:generateContent" {
						t.Errorf("path = %s", r.URL.Path)
					}
					if r.Header.Get("x-goog-api-key") != testAPIKey {
						t.Errorf("x-goog-api-key = %q", r.Header.Get("x-goog-api-key"))
					}
					w.Header().Set("Content-Type", "application/json")
					io.WriteString(w, `{"candidates":[{"content":{"parts":[{"text":"GEMINI-REPLY"}]}}]}`)
				}
			},
			wantText: "GEMINI-REPLY",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(tc.handler(t, "the prompt"))
			defer srv.Close()
			p := testProvider(srv.URL, tc.protocol, "model-x")
			if tc.protocol == domain.AIProtocolGemini {
				p.Models = []string{"gemini-test"}
			}
			got, err := completeProvider(context.Background(), p, p.Models[0], completionRequest{prompt: "the prompt"})
			if err != nil {
				t.Fatalf("completeProvider: %v", err)
			}
			if got != tc.wantText {
				t.Fatalf("got %q, want %q", got, tc.wantText)
			}
		})
	}
}

func TestCompleteProviderUnknownProtocol(t *testing.T) {
	p := testProvider("https://x.example", "ollama", "m")
	if _, err := completeProvider(context.Background(), p, "m", completionRequest{prompt: "hi"}); err == nil {
		t.Fatal("expected error for unsupported protocol")
	}
}

func TestCompleteProviderMissingKey(t *testing.T) {
	p := testProvider("https://x.example", domain.AIProtocolOpenAI, "m")
	p.APIKey = ""
	_, err := completeProvider(context.Background(), p, "m", completionRequest{prompt: "hi"})
	if err == nil || !strings.Contains(err.Error(), "no API key") {
		t.Fatalf("err = %v, want missing-key error", err)
	}
}

// HTTP failures must map to clear messages and NEVER carry the API key,
// even if the provider echoed it back inside its error body.
func TestProviderHTTPErrorIsMasked(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		b, _ := json.Marshal(map[string]any{"error": map[string]string{"message": "invalid api key " + testAPIKey}})
		w.Write(b)
	}))
	defer srv.Close()

	p := testProvider(srv.URL, domain.AIProtocolOpenAI, "m")
	_, err := completeProvider(context.Background(), p, "m", completionRequest{prompt: "hi"})
	if err == nil {
		t.Fatal("expected error")
	}
	if strings.Contains(err.Error(), testAPIKey) {
		t.Fatalf("error leaked the api key: %v", err)
	}
	if !strings.Contains(err.Error(), "401") {
		t.Fatalf("err = %v, want a 401-flavoured message", err)
	}
}

func decodeBody(t *testing.T, r *http.Request) map[string]any {
	t.Helper()
	var raw map[string]any
	body, err := io.ReadAll(r.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatalf("unmarshal body %s: %v", body, err)
	}
	return raw
}
