package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/rand"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

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
	questionRepo QuestionRepository
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

// PracticeSubjects reports which subjects have questions in the stored bank,
// so the practice UI can offer them without an LLM call.
func (a *aiUsecase) PracticeSubjects() ([]string, error) {
	if a.questionRepo == nil {
		// No bank wired (unit tests / stripped wiring): nothing to list.
		return nil, nil
	}
	questions, err := a.questionRepo.GetAllQuestions()
	if err != nil {
		log.Printf("ai practice: listing bank subjects failed: %v", err)
		return nil, err
	}
	seen := map[string]bool{}
	var subjects []string
	for _, q := range questions {
		if !isGradeableQuestion(q) {
			continue
		}
		s := strings.TrimSpace(q.Subject)
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		subjects = append(subjects, s)
	}
	sort.Strings(subjects)
	return subjects, nil
}

// isGradeableQuestion reports whether a stored bank question can be used in a
// practice session: it must have options and a valid 1-based answer index into
// them. Bank rows parsed from documents can carry answer=0 (unresolved key)
// or an out-of-range index; those would break scoring, so they are excluded.
func isGradeableQuestion(q domain.Question) bool {
	return len(q.MultipleChoice) > 0 && q.Answer >= 1 && q.Answer <= len(q.MultipleChoice)
}

// PracticeBankQuestions pulls a practice session of bankQuestions from the
// stored bank for a subject. If a topic is given, it prefers questions
// matching that chapter; otherwise it samples from the whole subject. When
// there are fewer matching questions than requested, it falls back to the
// full subject pool, so a session is always sized to the requested count.
func (a *aiUsecase) PracticeBankQuestions(subject, topic string, count int) ([]domain.Question, error) {
	if a.questionRepo == nil {
		return nil, errors.New("stored question bank is not available")
	}
	if count <= 0 {
		count = 10
	}
	all, err := a.questionRepo.GetAllQuestions()
	if err != nil {
		log.Printf("ai practice: loading bank questions failed: %v", err)
		return nil, err
	}

	var pool []domain.Question
	for _, q := range all {
		if !strings.EqualFold(strings.TrimSpace(q.Subject), strings.TrimSpace(subject)) {
			continue
		}
		// Drop non-gradeable rows (see isGradeableQuestion) so the session
		// always scores correctly.
		if !isGradeableQuestion(q) {
			continue
		}
		pool = append(pool, q)
	}
	if len(pool) == 0 {
		return nil, fmt.Errorf("no gradeable stored questions found for subject %q", subject)
	}

	// Prefer a topic/chapter subset when one is requested and exists.
	if strings.TrimSpace(topic) != "" {
		var match []domain.Question
		for _, q := range pool {
			if strings.EqualFold(strings.TrimSpace(q.Chapter), strings.TrimSpace(topic)) ||
				strings.Contains(strings.ToLower(q.QuestionText), strings.ToLower(strings.TrimSpace(topic))) {
				match = append(match, q)
			}
		}
		if len(match) > 0 {
			pool = match
		}
	}

	// Shuffle and take up to `count`. Use a deterministic-enough shuffle so
	// repeated practice runs vary.
	rnd := rand.New(rand.NewSource(time.Now().UnixNano()))
	rnd.Shuffle(len(pool), func(i, j int) {
		pool[i], pool[j] = pool[j], pool[i]
	})
	if len(pool) > count {
		pool = pool[:count]
	}
	return pool, nil
}

// selectProvider resolves the provider row every AI call goes through:
// the admin-tagged default provider wins (only when enabled with at least
// one model, using its default model or first model); otherwise the oldest
// enabled row; with no usable rows we fall back to the env-configured
// OpenAI-compatible endpoint (AI_API_URL/AI_API_KEY/MODEL_NAME) and then the
// legacy GOOGLE_API_KEY Gemini setup, so existing deployments keep working.
// A repository read failure also degrades to the env fallbacks when keys are
// present (the AI surface must not hard-depend on the new table), and only
// errors when neither path can serve a request.
func (a *aiUsecase) selectProvider() (*domain.AIProvider, string, error) {
	var providers []domain.AIProvider
	if a.providerRepo != nil {
		list, err := a.providerRepo.GetAllProviders()
		if err != nil {
			if fb := a.envProviderFallback(); fb != nil {
				return fb, modelFor(fb), nil
			}
			return nil, "", fmt.Errorf("list ai providers: %w", err)
		}
		providers = list
	}
	if p := pickProvider(providers); p != nil {
		return p, modelFor(p), nil
	}
	if fb := a.envProviderFallback(); fb != nil {
		return fb, modelFor(fb), nil
	}
	return nil, "", errors.New("no enabled AI provider configured and no AI_* / GOOGLE_API_KEY env fallback is set")
}

// envProviderFallback returns the env-configured provider, preferring the
// explicit OpenAI-compatible endpoint (AI_API_URL + AI_API_KEY + MODEL_NAME)
// over the legacy GOOGLE_API_KEY Gemini setup.
func (a *aiUsecase) envProviderFallback() *domain.AIProvider {
	if fb := a.envOpenAIProvider(); fb != nil {
		return fb
	}
	return a.envFallbackProvider()
}

// envOpenAIProvider builds a provider from AI_API_URL/AI_API_KEY/MODEL_NAME —
// the quickest way to bring a deployment live without a panel round-trip.
// Limits default to GLM-4.7-Flash's published specs (131k context / 98k max
// output) and are overridable with AI_MODEL_CONTEXT_WINDOW and
// AI_MODEL_MAX_OUTPUT_TOKENS.
func (a *aiUsecase) envOpenAIProvider() *domain.AIProvider {
	baseURL, key, model := os.Getenv("AI_API_URL"), os.Getenv("AI_API_KEY"), os.Getenv("MODEL_NAME")
	if baseURL == "" || key == "" || model == "" {
		return nil
	}
	contextWindow := 131_072
	if v := os.Getenv("AI_MODEL_CONTEXT_WINDOW"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			contextWindow = n
		}
	}
	maxOutput := 98_304
	if v := os.Getenv("AI_MODEL_MAX_OUTPUT_TOKENS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxOutput = n
		}
	}
	return &domain.AIProvider{
		Name:     "env:AI_API_URL",
		BaseURL:  baseURL,
		APIKey:   key,
		Protocol: domain.AIProtocolOpenAI,
		Models:   domain.ModelList{{Name: model, ContextWindow: contextWindow, MaxOutputTokens: maxOutput}},
		Enabled:  true,
	}
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

// ChatExplain runs the on-question AI tutor: it receives the whole generated
// quiz (with each question's correct answer, for context only) plus the
// focused question and an optional free-text follow-up. The hard requirement
// is that the model NEVER reveal the focused question's answer — it guides
// with the concept, reasoning patterns and topic notes instead. Output is
// markdown. The quiz context is inlined as data so the model can reference
// "option C is about X" without stating which option is correct.
func (a *aiUsecase) ChatExplain(req domain.AiChatExplainRequest) (string, error) {
	if len(req.Quiz) == 0 {
		// A solo ask with no quiz: fall back to just the focus question so
		// the tutor still has subject/grade/chapter context.
		req.Quiz = []domain.Question{req.Focus}
	}

	// Data block: the full quiz with answers (context, not a spoiler for the
	// focused question — the system instruction says so explicitly).
	quizJSON, err := json.MarshalIndent(req.Quiz, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal quiz context: %w", err)
	}
	focusJSON, err := json.MarshalIndent(req.Focus, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal focused question: %w", err)
	}

	var ctxBits []string
	if req.Focus.Subject != "" {
		ctxBits = append(ctxBits, "Subject: "+req.Focus.Subject)
	}
	if req.Focus.Grade != "" {
		ctxBits = append(ctxBits, "Grade level: "+req.Focus.Grade)
	}
	if req.Focus.Chapter != "" {
		ctxBits = append(ctxBits, "Chapter/topic: "+req.Focus.Chapter)
	}
	if len(ctxBits) > 0 {
		ctxBits = append([]string{"Context —"}, ctxBits...)
	}

	system := "You are a patient, encouraging academic tutor for a student studying this topic.\n" +
		strings.Join(ctxBits, "\n") +
		`
The student is working through a short generated quiz and is now focused on ONE specific question shown below.

ABSOLUTE RULES:
1. NEVER reveal, state, hint at, or identify the correct answer to the focused question, and never reveal the answers of any other quiz question. Do not say "the answer is X", "option B is correct", or equivalent.
2. Do NOT solve the focused question for the student. Instead, guide them: explain the underlying concept or principle, walk through the kind of reasoning the topic requires, and point out common traps.
3. Provide clear topic notes the student can apply, using step-by-step "how to think about it" guidance rather than "which option to pick".
4. If the student asks a follow-up about the focused question, keep guiding without giving the answer — help them reason it out themselves.
5. Format your reply in clear Markdown: use short headings, bullet points, and a small worked example of the *reasoning method* (use a different, unrelated value if it helps), not the specific answer to this question.

Be warm, concise, and encouraging. If a concept is unclear, restate it more simply.`

	userParts := []string{
		"Here is the full quiz (JSON, for context only — do not disclose these answers):",
		string(quizJSON),
		"\nThe focused question the student is asking about now:",
		string(focusJSON),
	}
	if strings.TrimSpace(req.AskText) != "" {
		userParts = append(userParts, "\nStudent's follow-up question: "+strings.TrimSpace(req.AskText))
	} else {
		userParts = append(userParts, "\nThe student wants a guided explanation of this question (they have not asked a specific follow-up yet).")
	}
	userMsg := strings.Join(userParts, "\n")

	// Build the multi-message conversation for the provider.
	msgs := []openAIChatMsg{
		{Role: "system", Content: system},
		{Role: "user", Content: userMsg},
	}

	provider, modelName, err := a.selectProvider()
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), aiCallTimeout)
	defer cancel()
	// Chat replies are short-to-medium; keep a modest output budget.
	return completeProvider(ctx, *provider, modelName, completionRequest{
		chatMessages: msgs,
		maxTokens:    2048,
	})
}

// CompleteDocumentParse runs one bulk-question-parsing completion. Document
// parses are the largest AI surface in the app — a 60-question exam's JSON
// alone can run ~8k output tokens — so the call carries its own longer timeout,
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
	maxTokens := documentParseMaxTokensBudget()
	if model.MaxOutputTokens > 0 {
		// An explicitly configured model budget is authoritative in BOTH
		// directions: it clamps over-generous defaults and raises the budget
		// for models that support long outputs (big exams need it).
		maxTokens = model.MaxOutputTokens
	}

	timeout := documentParseTimeout()
	req := completionRequest{
		prompt:    prompt,
		maxTokens: maxTokens,
		timeout:   timeout,
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

	log.Printf("ai document parse: calling %s/%s (prompt %d chars, %d inline images, max_tokens %d, timeout %s)",
		provider.Name, model.Name, len(prompt), len(req.images), maxTokens, timeout)
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	start := time.Now()
	text, err := completeProvider(ctx, *provider, modelName, req)
	if err != nil {
		log.Printf("ai document parse: call failed after %s: %v", time.Since(start).Round(time.Millisecond), err)
		return "", err
	}
	log.Printf("ai document parse: call succeeded in %s (%d chars back)", time.Since(start).Round(time.Millisecond), len(text))
	return text, nil
}

type AiUsecase interface {
	PracticeWithAi(seting domain.AiPracticeSetting) (*[]domain.Question, error)
	GenerateRecommendations(input domain.RecommendationInput) (*domain.Recommendations, error)
	CompleteDocumentParse(prompt string, images []DocumentImage) (string, error)
	// ChatExplain is the on-question AI tutor (guide, never spoiler). See
	// the method for the system-instruction contract.
	ChatExplain(req domain.AiChatExplainRequest) (string, error)
	// PracticeSubjects reports which subjects have stored-bank questions, so
	// the practice UI can offer them without an LLM call.
	PracticeSubjects() ([]string, error)
	// PracticeBankQuestions pulls a practice session from the stored bank for a
	// subject (optionally scoped to a topic). Fails with a clear error when
	// the bank has no matching questions.
	PracticeBankQuestions(subject, topic string, count int) ([]domain.Question, error)
}

func NewAiUsecase(subRepo SubmissionRepository, providerRepo AiProviderRepository, questionRepo QuestionRepository) AiUsecase {
	return &aiUsecase{subRepo: subRepo, providerRepo: providerRepo, questionRepo: questionRepo}
}
