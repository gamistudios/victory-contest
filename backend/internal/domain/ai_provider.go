package domain

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"

	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
)

// AI wire protocols supported by the provider client layer. The protocol —
// never the provider name — decides which HTTP shape the request builder
// uses (internal/usecase/provider_client.go).
const (
	AIProtocolOpenAI    = "openai"    // POST {base}/chat/completions
	AIProtocolAnthropic = "anthropic" // POST {base}/v1/messages
	AIProtocolGemini    = "gemini"    // POST {base}/v1beta/models/{model}:generateContent
)

// AIProtocolSet is the closed validation set for AIProvider.Protocol.
var AIProtocolSet = map[string]bool{
	AIProtocolOpenAI:    true,
	AIProtocolAnthropic: true,
	AIProtocolGemini:    true,
}

// AIModel is one entry in a provider's model catalog, carrying the limits
// the client layer clamps to (mirrors the ScoOS model management: both
// limits are optional — 0 means "use the protocol default").
type AIModel struct {
	Name            string `json:"name"              dynamodbav:"name"`
	ContextWindow   int    `json:"context_window"    dynamodbav:"context_window,omitempty"`
	MaxOutputTokens int    `json:"max_output_tokens" dynamodbav:"max_output_tokens,omitempty"`
}

// ModelList marshals as a list of maps and also unmarshals the legacy
// string-list shape (rows written before per-model limits existed, and older
// API clients), so old data and old payloads keep loading.
type ModelList []AIModel

// UnmarshalJSON accepts both the object form ([{"name":…}]) and the legacy
// string form (["model-id"]).
func (l *ModelList) UnmarshalJSON(data []byte) error {
	var objects []AIModel
	if err := json.Unmarshal(data, &objects); err == nil {
		*l = objects
		return nil
	}
	var names []string
	if err := json.Unmarshal(data, &names); err != nil {
		return errors.New("models must be an array of model names or {name, context_window, max_output_tokens} objects")
	}
	out := make(ModelList, 0, len(names))
	for _, n := range names {
		out = append(out, AIModel{Name: n})
	}
	*l = out
	return nil
}

// UnmarshalDynamoDBAttributeValue accepts both the current map entries and
// the historical plain-string entries.
func (l *ModelList) UnmarshalDynamoDBAttributeValue(av types.AttributeValue) error {
	list, ok := av.(*types.AttributeValueMemberL)
	if !ok {
		return fmt.Errorf("models: expected list attribute, got %T", av)
	}
	out := make(ModelList, 0, len(list.Value))
	for _, item := range list.Value {
		switch m := item.(type) {
		case *types.AttributeValueMemberS:
			out = append(out, AIModel{Name: m.Value})
		case *types.AttributeValueMemberM:
			var model AIModel
			if err := attributevalue.UnmarshalMap(m.Value, &model); err != nil {
				return fmt.Errorf("models: %w", err)
			}
			out = append(out, model)
		default:
			return fmt.Errorf("models: unsupported entry type %T", item)
		}
	}
	*l = out
	return nil
}

// ResolveModel returns the named model, or a zero-limits stand-in when the
// name is not in the catalog.
func (p AIProvider) ResolveModel(name string) AIModel {
	for _, m := range p.Models {
		if m.Name == name {
			return m
		}
	}
	return AIModel{Name: name}
}

// AIProvider is an admin-managed LLM endpoint (table "ai_providers").
// APIKey carries json:"-" so it can NEVER serialize out of any handler,
// even accidentally through the domain struct itself; list/get responses
// use the handler-level view with a last-4-char hint instead.
type AIProvider struct {
	ID       string    `json:"id"         dynamodbav:"id"`
	Name     string    `json:"name"       dynamodbav:"name"`
	BaseURL  string    `json:"base_url"   dynamodbav:"base_url"`
	APIKey   string    `json:"-"          dynamodbav:"api_key"`
	Protocol string    `json:"protocol"   dynamodbav:"protocol"`
	Models   ModelList `json:"models"     dynamodbav:"models"`
	Enabled  bool      `json:"enabled"    dynamodbav:"enabled"`
	// IsDefault marks the single admin-chosen provider that student AI calls
	// prefer over the oldest-enabled rule. DefaultModel optionally pins which
	// of Models to use; empty means "first model". Both are plain attributes
	// on the same row (no separate pointer table), so the invariant "exactly
	// one default" is maintained by the usecase's read-modify-write update.
	IsDefault    bool   `json:"is_default"    dynamodbav:"is_default"`
	DefaultModel string `json:"default_model" dynamodbav:"default_model"`
	CreatedAt    string `json:"created_at" dynamodbav:"created_at"`
	UpdatedAt    string `json:"updated_at" dynamodbav:"updated_at"`
}

// ValidateBaseURL enforces the SSRF/credential-exfil guardrail for stored
// provider endpoints:
//   - absolute http(s) URL with a host,
//   - https everywhere, or plaintext http ONLY on loopback (dev servers),
//   - no embedded credentials (user:pass@host would leak auth to the URL).
func ValidateBaseURL(raw string) error {
	if strings.TrimSpace(raw) == "" {
		return errors.New("base_url is required")
	}
	if strings.ContainsAny(raw, " \t\n") {
		return errors.New("base_url must not contain whitespace")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return errors.New("base_url is not a valid URL")
	}
	if u.User != nil {
		return errors.New("base_url must not embed credentials")
	}
	if u.Host == "" {
		return errors.New("base_url must include a host")
	}
	host := strings.ToLower(u.Hostname())
	switch u.Scheme {
	case "https":
		return nil
	case "http":
		if host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "[::1]" {
			return nil
		}
		return errors.New("base_url must use https (http is only allowed for localhost)")
	default:
		return errors.New("base_url scheme must be http or https")
	}
}

// Validate checks the invariant an AIProvider row must satisfy before it is
// stored. It is deliberately a plain error (not a validator-tag dependency)
// so both the admin handler and any future import path can reuse it.
func (p AIProvider) Validate() error {
	if strings.TrimSpace(p.Name) == "" {
		return errors.New("name is required")
	}
	if !AIProtocolSet[p.Protocol] {
		return errors.New(`protocol must be one of "openai", "anthropic", "gemini"`)
	}
	if err := ValidateBaseURL(p.BaseURL); err != nil {
		return err
	}
	if len(p.Models) == 0 {
		return errors.New("at least one model is required")
	}
	seen := map[string]bool{}
	for _, m := range p.Models {
		if strings.TrimSpace(m.Name) == "" {
			return errors.New("every model needs a name")
		}
		if m.ContextWindow < 0 || m.MaxOutputTokens < 0 {
			return fmt.Errorf("model %q limits must be non-negative", m.Name)
		}
		if seen[m.Name] {
			return fmt.Errorf("duplicate model %q", m.Name)
		}
		seen[m.Name] = true
	}
	return nil
}
