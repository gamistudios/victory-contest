package usecase

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"victory-contest-go/internal/domain"
)

// envKV reads key=value lines from the repo-root .env without touching the
// process environment (godotenv would leak AI_* keys into other tests).
func envKV(t *testing.T) map[string]string {
	t.Helper()
	data, err := os.ReadFile("../../../.env")
	if err != nil {
		return nil
	}
	out := map[string]string{}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if k, v, ok := strings.Cut(line, "="); ok {
			out[strings.TrimSpace(k)] = strings.TrimSpace(v)
		}
	}
	return out
}

// TestLiveDocumentParse is a real end-to-end probe: it reads the repo-root
// .env (AI_API_URL / AI_API_KEY / MODEL_NAME), runs the production parse
// pipeline (chunking, retries, vision parts, answer-key merge) against the
// real provider with the real exam fixture, and reports what came back.
// Skips when the env file or the fixture are absent, so normal CI never
// spends provider tokens. Values are injected explicitly — the process
// environment stays untouched.
func TestLiveDocumentParse(t *testing.T) {
	// Strictly opt-in: it spends real provider tokens and takes many minutes.
	// Run with:  AI_LIVE_TEST=1 go test ./internal/usecase -run TestLiveDocumentParse -v
	if os.Getenv("AI_LIVE_TEST") != "1" {
		t.Skip("set AI_LIVE_TEST=1 to run the live provider probe (spends real tokens)")
	}
	env := envKV(t)
	baseURL, key, model := env["AI_API_URL"], env["AI_API_KEY"], env["MODEL_NAME"]
	if baseURL == "" || key == "" || model == "" {
		t.Skip("AI_API_URL / AI_API_KEY / MODEL_NAME not in the root .env; skipping live provider probe")
	}
	content, err := os.ReadFile("testdata/esslce-2018-chemistry.pdf")
	if err != nil {
		if os.IsNotExist(err) {
			t.Skip("real-exam fixture not present")
		}
		t.Fatalf("read fixture: %v", err)
	}

	provider := domain.AIProvider{
		Name: "live-probe", BaseURL: baseURL, APIKey: key,
		Protocol: domain.AIProtocolOpenAI,
		Models:   domain.ModelList{{Name: model}}, Enabled: true,
	}
	complete := func(prompt string, imgs []DocumentImage) (string, error) {
		req := completionRequest{prompt: prompt, maxTokens: documentParseMaxTokensBudget(), timeout: documentParseTimeout()}
		for _, img := range imgs {
			if b64, err := encodeImageFileB64(img.Path, maxDocumentImageBytes); err == nil {
				req.images = append(req.images, completionImage{MIME: img.MIME, B64: b64})
			}
		}
		ctx, cancel := context.WithTimeout(context.Background(), documentParseTimeout())
		defer cancel()
		return completeProvider(ctx, provider, model, req)
	}

	// Smoke call first: isolates connectivity/auth from payload weight. The
	// endpoint is intermittently overloaded, so give it one retry.
	var smoke string
	start := time.Now()
	for attempt := 1; attempt <= 2; attempt++ {
		smokeCtx, cancelSmoke := context.WithTimeout(context.Background(), 90*time.Second)
		smoke, err = completeProvider(smokeCtx, provider, model, completionRequest{
			prompt: "Reply with exactly: OK", maxTokens: 512, timeout: 90 * time.Second,
		})
		cancelSmoke()
		if err == nil {
			break
		}
		t.Logf("smoke attempt %d failed after %s: %v", attempt, time.Since(start).Round(time.Millisecond), err)
		time.Sleep(3 * time.Second)
	}
	if err != nil {
		t.Fatalf("smoke call to %s (%s) kept failing: %v", baseURL, model, err)
	}
	t.Logf("smoke call ok in %s: %q", time.Since(start).Round(time.Millisecond), smoke)

	pages, err := ExtractDocumentPages("esslce-2018-chemistry.pdf", content)
	if err != nil {
		t.Fatalf("ExtractDocumentPages: %v", err)
	}
	images, err := ExtractDocumentImages("esslce-2018-chemistry.pdf", content)
	if err != nil {
		t.Fatalf("ExtractDocumentImages: %v", err)
	}
	totalChars := 0
	for _, p := range pages {
		totalChars += len(p)
	}
	t.Logf("document: %d pages (%d chars), %d images", len(pages), totalChars, len(images))

	parseStart := time.Now()
	questions, err := ParseQuestionsWithAI(pages, images, complete)
	if err != nil {
		t.Fatalf("live parse failed after %s: %v", time.Since(parseStart).Round(time.Second), err)
	}
	t.Logf("live parse finished in %s: %d questions", time.Since(parseStart).Round(time.Second), len(questions))

	tagged := 0
	answered := 0
	for i, q := range questions {
		if q.Answer >= 1 {
			answered++
		}
		if q.ImageIndex != 0 {
			tagged++
		}
		if i < 3 {
			t.Logf("sample q%d: %q options=%d answer=%d image=%d", i+1, q.QuestionText, len(q.MultipleChoice), q.Answer, q.ImageIndex)
		}
	}
	t.Logf("answered %d/%d, image-tagged %d", answered, len(questions), tagged)
	if len(questions) < 10 {
		t.Fatalf("only %d questions parsed from the 60-question exam", len(questions))
	}
}
