package usecase

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"victory-contest-go/internal/domain"
)

// Per-protocol LLM wire adapters, one small stdlib net/http client each:
//
//	openai    POST {base}/chat/completions   Authorization: Bearer <key>
//	anthropic POST {base}/v1/messages        x-api-key + anthropic-version
//	gemini    POST {base}/v1beta/models/{model}:generateContent  x-goog-api-key
//
// Request shapes follow the reference implementation in the user's ScoOS
// project (app/src/main/java/com/agentisco/agent/llm/LlmService.kt): header
// sets, the /v1 de-duplication for anthropic base URLs, error-body parsing
// and "never echo the key" masking. Each adapter is split into a pure
// request builder and a pure response parser so unit tests can drive them
// against a local httptest server without touching the network.

const (
	// aiCallTimeout bounds one completion request. It is deliberately NOT
	// awsconfig.CallTimeout (15 s): generation legitimately runs longer.
	aiCallTimeout = 60 * time.Second
	// aiProbeTimeout bounds the admin "test provider" ping, which should
	// fail fast on a bad key/endpoint.
	aiProbeTimeout = 20 * time.Second
	// anthropic requires max_tokens on every request; this is the default
	// for full generations (25-question JSON and study plans run long).
	anthropicDefaultMaxTokens = 8192
	// cap for reading provider error bodies
	maxErrBody = 2048
)

// completionRequest is one prompt-to-text call against a provider row.
type completionRequest struct {
	prompt    string
	maxTokens int // 0 = protocol default (omitted where optional)
	timeout   time.Duration
	// images, when set, ride inline as vision parts alongside the prompt.
	// Text-only requests keep the exact wire shape the protocols used before
	// vision existed (plain string content), so existing callers/tests are
	// unaffected.
	images []completionImage
}

// completionImage is one inline image for vision-capable models.
type completionImage struct {
	MIME string // e.g. image/jpeg, image/png
	B64  string // base64 payload, no data: prefix
}

// effectiveTimeout bounds the HTTP call: callers with long generations
// (document parsing) override the default.
func (r completionRequest) effectiveTimeout() time.Duration {
	if r.timeout > 0 {
		return r.timeout
	}
	return aiCallTimeout
}

// completeProvider dispatches prompt to the wire adapter for p.Protocol and
// returns the assistant text. model is the caller-resolved model id.
func completeProvider(ctx context.Context, p domain.AIProvider, model string, req completionRequest) (string, error) {
	if strings.TrimSpace(p.APIKey) == "" {
		return "", fmt.Errorf("provider %q has no API key configured", p.Name)
	}
	var (
		httpReq *http.Request
		parse   func(body []byte) (string, error)
		err     error
	)
	switch p.Protocol {
	case domain.AIProtocolOpenAI:
		httpReq, parse, err = buildOpenAIRequest(ctx, p, model, req)
	case domain.AIProtocolAnthropic:
		httpReq, parse, err = buildAnthropicRequest(ctx, p, model, req)
	case domain.AIProtocolGemini:
		httpReq, parse, err = buildGeminiRequest(ctx, p, model, req)
	default:
		return "", fmt.Errorf("provider %q has unsupported protocol %q", p.Name, p.Protocol)
	}
	if err != nil {
		return "", err
	}
	return doProviderCall(httpReq, p.APIKey, parse, req.effectiveTimeout())
}

// doProviderCall executes a built request and funnels success through the
// protocol parser / failure through the masked provider-error mapping.
func doProviderCall(httpReq *http.Request, apiKey string, parse func([]byte) (string, error), timeout time.Duration) (string, error) {
	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("provider request failed: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", fmt.Errorf("reading provider response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return "", providerHTTPError(resp.StatusCode, body, apiKey)
	}
	text, err := parse(body)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(text) == "" {
		return "", errors.New("provider returned an empty response")
	}
	return text, nil
}

// providerHTTPError turns a non-2xx into a clear, key-masked error. Only the
// provider's own error.message (if the body carries one) is appended, so we
// never forward raw upstream payloads.
func providerHTTPError(status int, body []byte, apiKey string) error {
	friendly := func() string {
		switch status {
		case http.StatusUnauthorized:
			return "provider rejected the API key (401)"
		case http.StatusForbidden:
			return "provider denied permission (403)"
		case http.StatusNotFound:
			return "invalid endpoint or unknown model (404) — check base_url and model id"
		case http.StatusTooManyRequests:
			return "rate limited by the provider (429), try again shortly"
		}
		if status >= 500 && status <= 599 {
			return fmt.Sprintf("provider server error (%d), the service may be temporarily down", status)
		}
		return fmt.Sprintf("unexpected provider response (HTTP %d)", status)
	}()
	if msg := extractProviderErrorMessage(body); msg != "" {
		friendly += ": " + msg
	}
	return errors.New(maskKey(friendly, apiKey))
}

func extractProviderErrorMessage(body []byte) string {
	var probe struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &probe); err != nil {
		return ""
	}
	msg := strings.TrimSpace(probe.Error.Message)
	if len(msg) > maxErrBody {
		msg = msg[:maxErrBody]
	}
	return msg
}

// maskKey guarantees an API key can never ride out inside an error string,
// even if the provider echoed part of the request back.
func maskKey(s, apiKey string) string {
	if apiKey != "" {
		s = strings.ReplaceAll(s, apiKey, "[redacted]")
	}
	return s
}

// joinURLPath mirrors the ScoOS clients: base URLs are pasted with or
// without trailing slashes; collapse to one.
func joinURLPath(base, path string) string {
	return strings.TrimRight(base, "/") + "/" + strings.TrimLeft(path, "/")
}

// --- OpenAI Chat Completions ---

type openAIChatRequest struct {
	Model     string          `json:"model"`
	Messages  []openAIChatMsg `json:"messages"`
	MaxTokens int             `json:"max_tokens,omitempty"`
}

// openAIChatMsg carries `Content any`: a plain string for text-only calls
// (the historical wire shape) or an array of text/image_url parts when
// images are attached.
type openAIChatMsg struct {
	Role    string `json:"role"`
	Content any    `json:"content"`
}

type openAIContentPart struct {
	Type     string          `json:"type"`
	Text     string          `json:"text,omitempty"`
	ImageURL *openAIImageURL `json:"image_url,omitempty"`
}

type openAIImageURL struct {
	URL string `json:"url"`
}

// openAIContent builds the message content: prompt-only stays a string;
// with images it becomes the multi-part form.
func openAIContent(req completionRequest) any {
	if len(req.images) == 0 {
		return req.prompt
	}
	parts := []openAIContentPart{{Type: "text", Text: req.prompt}}
	for _, img := range req.images {
		parts = append(parts, openAIContentPart{
			Type:     "image_url",
			ImageURL: &openAIImageURL{URL: "data:" + img.MIME + ";base64," + img.B64},
		})
	}
	return parts
}

func buildOpenAIRequest(ctx context.Context, p domain.AIProvider, model string, req completionRequest) (*http.Request, func([]byte) (string, error), error) {
	payload := openAIChatRequest{
		Model:     model,
		Messages:  []openAIChatMsg{{Role: "user", Content: openAIContent(req)}},
		MaxTokens: req.maxTokens,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, nil, fmt.Errorf("marshal openai request: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, joinURLPath(p.BaseURL, "chat/completions"), bytes.NewReader(body))
	if err != nil {
		return nil, nil, fmt.Errorf("build openai request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.APIKey)
	return httpReq, parseOpenAIResponse, nil
}

func parseOpenAIResponse(body []byte) (string, error) {
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", fmt.Errorf("parse openai response: %w", err)
	}
	if len(out.Choices) == 0 {
		return "", errors.New("openai response contained no choices")
	}
	return out.Choices[0].Message.Content, nil
}

// --- Anthropic Messages ---

type anthropicRequest struct {
	Model     string          `json:"model"`
	MaxTokens int             `json:"max_tokens"`
	Messages  []openAIChatMsg `json:"messages"`
}

// anthropicMessagesURL mirrors the ScoOS AnthropicMessagesClient: users
// routinely paste a base URL already ending in /v1, so strip it before
// re-appending the versioned path exactly once.
func anthropicMessagesURL(base string) string {
	root := strings.TrimRight(base, "/")
	root = strings.TrimSuffix(root, "/v1")
	return root + "/v1/messages"
}

// anthropicContentPart is one content block: text or a base64 image source.
type anthropicContentPart struct {
	Type   string          `json:"type"`
	Text   string          `json:"text,omitempty"`
	Source *anthropicImage `json:"source,omitempty"`
}

type anthropicImage struct {
	Type      string `json:"type"` // always "base64"
	MediaType string `json:"media_type"`
	Data      string `json:"data"`
}

// anthropicContent builds the message content: prompt-only stays a plain
// string (historical wire shape); images switch to the parts array.
func anthropicContent(req completionRequest) any {
	if len(req.images) == 0 {
		return req.prompt
	}
	parts := []anthropicContentPart{{Type: "text", Text: req.prompt}}
	for _, img := range req.images {
		parts = append(parts, anthropicContentPart{
			Type: "image",
			Source: &anthropicImage{
				Type:      "base64",
				MediaType: img.MIME,
				Data:      img.B64,
			},
		})
	}
	return parts
}

func buildAnthropicRequest(ctx context.Context, p domain.AIProvider, model string, req completionRequest) (*http.Request, func([]byte) (string, error), error) {
	maxTokens := req.maxTokens
	if maxTokens <= 0 {
		maxTokens = anthropicDefaultMaxTokens
	}
	payload := anthropicRequest{
		Model:     model,
		MaxTokens: maxTokens,
		Messages:  []openAIChatMsg{{Role: "user", Content: anthropicContent(req)}},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, nil, fmt.Errorf("marshal anthropic request: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, anthropicMessagesURL(p.BaseURL), bytes.NewReader(body))
	if err != nil {
		return nil, nil, fmt.Errorf("build anthropic request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", p.APIKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")
	return httpReq, parseAnthropicResponse, nil
}

func parseAnthropicResponse(body []byte) (string, error) {
	var out struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", fmt.Errorf("parse anthropic response: %w", err)
	}
	var sb strings.Builder
	for _, block := range out.Content {
		if block.Type == "text" {
			sb.WriteString(block.Text)
		}
	}
	if sb.Len() == 0 {
		return "", errors.New("anthropic response contained no text blocks")
	}
	return sb.String(), nil
}

// --- Google Gemini generateContent ---

type geminiRequest struct {
	Contents         []geminiContent  `json:"contents"`
	GenerationConfig *geminiGenConfig `json:"generationConfig,omitempty"`
}

type geminiContent struct {
	Role  string       `json:"role"`
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text       string           `json:"text,omitempty"`
	InlineData *geminiImageData `json:"inlineData,omitempty"`
}

type geminiImageData struct {
	MIMEType string `json:"mimeType"`
	Data     string `json:"data"`
}

type geminiGenConfig struct {
	MaxOutputTokens int `json:"maxOutputTokens,omitempty"`
}

func geminiModelURL(base, model string) string {
	return joinURLPath(base, "v1beta/models/"+model+":generateContent")
}

// geminiParts builds the request parts: prompt-only stays a single text part
// (historical wire shape); images append inlineData parts.
func geminiParts(req completionRequest) []geminiPart {
	parts := []geminiPart{{Text: req.prompt}}
	for _, img := range req.images {
		parts = append(parts, geminiPart{
			InlineData: &geminiImageData{MIMEType: img.MIME, Data: img.B64},
		})
	}
	return parts
}

func buildGeminiRequest(ctx context.Context, p domain.AIProvider, model string, req completionRequest) (*http.Request, func([]byte) (string, error), error) {
	payload := geminiRequest{
		Contents: []geminiContent{{
			Role:  "user",
			Parts: geminiParts(req),
		}},
	}
	if req.maxTokens > 0 {
		payload.GenerationConfig = &geminiGenConfig{MaxOutputTokens: req.maxTokens}
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, nil, fmt.Errorf("marshal gemini request: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, geminiModelURL(p.BaseURL, model), bytes.NewReader(body))
	if err != nil {
		return nil, nil, fmt.Errorf("build gemini request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	// Header auth instead of ?key= so the key never lands in URLs (and the
	// access logs that record them).
	httpReq.Header.Set("x-goog-api-key", p.APIKey)
	return httpReq, parseGeminiResponse, nil
}

func parseGeminiResponse(body []byte) (string, error) {
	var out struct {
		Candidates []struct {
			Content struct {
				Parts []geminiPart `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", fmt.Errorf("parse gemini response: %w", err)
	}
	if len(out.Candidates) == 0 {
		return "", errors.New("gemini response contained no candidates")
	}
	var sb strings.Builder
	for _, part := range out.Candidates[0].Content.Parts {
		sb.WriteString(part.Text)
	}
	if sb.Len() == 0 {
		return "", errors.New("gemini response contained no text parts")
	}
	return sb.String(), nil
}
