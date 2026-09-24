package domain

import (
	"errors"
	"net/url"
	"strings"
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

// AIProvider is an admin-managed LLM endpoint (table "ai_providers").
// APIKey carries json:"-" so it can NEVER serialize out of any handler,
// even accidentally through the domain struct itself; list/get responses
// use the handler-level view with a last-4-char hint instead.
type AIProvider struct {
	ID        string   `json:"id"         dynamodbav:"id"`
	Name      string   `json:"name"       dynamodbav:"name"`
	BaseURL   string   `json:"base_url"   dynamodbav:"base_url"`
	APIKey    string   `json:"-"          dynamodbav:"api_key"`
	Protocol  string   `json:"protocol"   dynamodbav:"protocol"`
	Models    []string `json:"models"     dynamodbav:"models"`
	Enabled   bool     `json:"enabled"    dynamodbav:"enabled"`
	CreatedAt string   `json:"created_at" dynamodbav:"created_at"`
	UpdatedAt string   `json:"updated_at" dynamodbav:"updated_at"`
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
	return nil
}
