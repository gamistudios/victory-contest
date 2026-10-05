package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"victory-contest-go/internal/domain"
)

// envFallbackProvider mirrors the pre-provider-setup deployment: a Gemini
// generateContent call against gemini-2.5-flash keyed by GOOGLE_API_KEY. It
// is used only when the ai_providers table has no enabled rows, so existing
// installs keep working untouched.
const (
	envFallbackBaseURL = "https://generativelanguage.googleapis.com"
	envFallbackModel   = "gemini-2.5-flash"
)

type aiUsecase struct {
	subRepo      SubmissionRepository
	providerRepo AiProviderRepository
}

func (a *aiUsecase) GenerateRecommendations(input domain.RecommendationInput) (*domain.Recommendations, error) {
	inputJSON, err := json.MarshalIndent(input, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("failed to marshal input data: %w", err)
	}

	// 2. Craft a detailed prompt for the provider API.
	prompt := fmt.Sprintf(`
	You are an expert academic tutor creating a study plan for a mobile app.
	Your response MUST be optimized for a mobile view: be concise, structured, and easy to read.

	**Student Performance Data:**
	%s

	**Instructions:**
	1.  Identify the relevant chapters for the subject: "%s". Ignore irrelevant ones.
	2.  Analyze the student's weakest relevant topics.
	3.  For each resource, you MUST specify the 'platform' where it is located (e.g., "Website", "YouTube", "Book").
	4.  Generate a response using the exact JSON structure below.
	5.  Keep all strings short and actionable.
	6.  Break the practice plan into weekly or daily steps, not a long paragraph.
	7.  **Your entire output must be a single, valid JSON object and nothing else.**

	**Required JSON Output Structure:**
	{
	"recommendations": ["short phrase 1", "short phrase 2"],
	"strategies": ["short phrase 1", "short phrase 2"],
	"resources": [
		{"name": "Resource Title", "topic": "Specific Topic", "platform": "Website/YouTube/Book", "type": "Video/Practice"}
	],
	"practicePlan": [
		{"timeframe": "Week 1", "focus": "A short description of the focus."}
	]
	}
	`, string(inputJSON), input.Subject)
	rawText, err := a.generate(prompt)
	if err != nil {
		return nil, err
	}

	startIndex := strings.Index(rawText, "{")
	endIndex := strings.LastIndex(rawText, "}")

	// Check if a valid JSON object was found.
	if startIndex == -1 || endIndex == -1 {
		return nil, errors.New("could not find JSON object in the API response")
	}

	// Slice the string to get only the JSON part.
	jsonStr := rawText[startIndex : endIndex+1]
	var recommendations domain.Recommendations
	if err := json.Unmarshal([]byte(jsonStr), &recommendations); err != nil {
		return nil, fmt.Errorf("failed to unmarshal JSON response from API: %w", err)
	}

	return &recommendations, nil
}

// PracticeWithAi implements AiUsecase.
func (a *aiUsecase) PracticeWithAi(setting domain.AiPracticeSetting) (*[]domain.Question, error) {
	// 1. Construct the prompt using Go's standard library.
	prompt := fmt.Sprintf(`
Generate 25 practice questions for a student.
The topic is %s for grade %s at a %s difficulty level.

For each question, provide the following in a clear, structured format:
- The question text.
- Four multiple-choice options.
- The index of the correct answer, 1-based: option A is 1, B is 2, C is 3, D is 4. Valid values are 1, 2, 3, or 4 — NEVER 0.
- A brief explanation for the correct answer.

IMPORTANT: Format the entire output as a JSON array where each element is a question object.
Each object must have these exact keys: "question_text", "multiple_choice", "answer", "explanation", "subject", "grade", "chapter".
`, setting.Subject, setting.Topic, setting.Difficulty)

	// 2. Call the API to get the raw text response.
	rawText, err := a.generate(prompt)
	if err != nil {
		return nil, fmt.Errorf("API call failed: %w", err)
	}

	// 3. Reliably extract the JSON array from the raw text.
	startIndex := strings.Index(rawText, "[")
	endIndex := strings.LastIndex(rawText, "]")

	if startIndex == -1 || endIndex == -1 || startIndex > endIndex {
		msg := "could not find a valid JSON array in the API response"
		return nil, errors.New(msg)
	}

	jsonStr := rawText[startIndex : endIndex+1]

	var questions []domain.Question
	if err := json.Unmarshal([]byte(jsonStr), &questions); err != nil {
		return nil, fmt.Errorf("failed to parse JSON from API: %w", err)
	}

	return &questions, nil

}

// selectProvider resolves the provider row every AI call goes through:
// the admin-tagged default provider wins (only when enabled with at least
// one model, using its default model or first model); otherwise the oldest
// enabled row; with no usable rows we fall back to the legacy GOOGLE_API_KEY
// Gemini setup so existing deployments keep working. A repository read
// failure also degrades to the env fallback when a key is present (the AI
// surface must not hard-depend on the new table), and only errors when
// neither path can serve a request.
func (a *aiUsecase) selectProvider() (*domain.AIProvider, string, error) {
	var providers []domain.AIProvider
	if a.providerRepo != nil {
		list, err := a.providerRepo.GetAllProviders()
		if err != nil {
			if fb := a.envFallbackProvider(); fb != nil {
				return fb, modelFor(fb), nil
			}
			return nil, "", fmt.Errorf("list ai providers: %w", err)
		}
		providers = list
	}
	if p := pickProvider(providers); p != nil {
		return p, modelFor(p), nil
	}
	if fb := a.envFallbackProvider(); fb != nil {
		return fb, modelFor(fb), nil
	}
	return nil, "", errors.New("no enabled AI provider configured and GOOGLE_API_KEY is not set")
}

func (a *aiUsecase) envFallbackProvider() *domain.AIProvider {
	apiKey := os.Getenv("GOOGLE_API_KEY")
	if apiKey == "" {
		return nil
	}
	return &domain.AIProvider{
		Name:     "env:GOOGLE_API_KEY",
		BaseURL:  envFallbackBaseURL,
		APIKey:   apiKey,
		Protocol: domain.AIProtocolGemini,
		Models:   domain.ModelList{{Name: envFallbackModel}},
		Enabled:  true,
	}
}

// generate is the single prompt-to-text entry point for both AI surfaces.
func (a *aiUsecase) generate(prompt string) (string, error) {
	provider, model, err := a.selectProvider()
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), aiCallTimeout)
	defer cancel()
	return completeProvider(ctx, *provider, model, completionRequest{prompt: prompt})
}

// CompleteDocumentParse runs one bulk-question-parsing completion. Document
// parses are the largest AI surface in the app — a 60-question exam's JSON
// alone is ~10k output tokens — so the call carries its own longer timeout,
// inline page images (vision) when the provider model supports them, and the
// model's own limits: max_output_tokens clamps the generation budget and the
// context window is checked up-front so an oversized part fails with a clear
// message instead of a provider-side mystery error. Images that cannot be
// read are skipped, never fatal: the prompt text carries the same
// information.
func (a *aiUsecase) CompleteDocumentParse(prompt string, images []DocumentImage) (string, error) {
	provider, modelName, err := a.selectProvider()
	if err != nil {
		return "", err
	}
	model := provider.ResolveModel(modelName)
	maxTokens := documentParseMaxTokens
	if model.MaxOutputTokens > 0 && model.MaxOutputTokens < maxTokens {
		maxTokens = model.MaxOutputTokens
	}

	req := completionRequest{
		prompt:    prompt,
		maxTokens: maxTokens,
		timeout:   aiDocumentParseTimeout,
	}
	for _, img := range images {
		b64, err := encodeImageFileB64(img.Path, maxDocumentImageBytes)
		if err != nil {
			log.Printf("ai document parse: skipping image %s: %v", img.Path, err)
			continue
		}
		req.images = append(req.images, completionImage{MIME: img.MIME, B64: b64})
	}

	if model.ContextWindow > 0 {
		// Rough token estimate: ~4 chars per text token, ~1.1k tokens per
		// inline image, plus the generation budget itself.
		estimate := len(prompt)/4 + len(req.images)*1100 + maxTokens
		if estimate > model.ContextWindow {
			return "", fmt.Errorf(
				"model %s context window (%d tokens) is too small for this document part (~%d tokens needed) — use a larger-context model or split the document",
				model.Name, model.ContextWindow, estimate)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), aiDocumentParseTimeout)
	defer cancel()
	return completeProvider(ctx, *provider, modelName, req)
}

type AiUsecase interface {
	PracticeWithAi(seting domain.AiPracticeSetting) (*[]domain.Question, error)
	GenerateRecommendations(input domain.RecommendationInput) (*domain.Recommendations, error)
	CompleteDocumentParse(prompt string, images []DocumentImage) (string, error)
}

func NewAiUsecase(subRepo SubmissionRepository, providerRepo AiProviderRepository) AiUsecase {
	return &aiUsecase{subRepo: subRepo, providerRepo: providerRepo}
}
