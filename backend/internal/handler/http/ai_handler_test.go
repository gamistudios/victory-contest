package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// fakeAiUsecase records whether the (paid) generation path was reached.
type fakeAiUsecase struct {
	practiceCalls   int
	recoCalls       int
	explainCalls    int
	bankCalls       int
	bankSubjectCalls int
}

func (f *fakeAiUsecase) PracticeWithAi(setting domain.AiPracticeSetting) (*[]domain.Question, error) {
	f.practiceCalls++
	qs := []domain.Question{{QuestionText: "2+2?", MultipleChoice: []string{"3", "4", "5", "6"}, Answer: 1}}
	return &qs, nil
}

func (f *fakeAiUsecase) GenerateRecommendations(in domain.RecommendationInput) (*domain.Recommendations, error) {
	f.recoCalls++
	return &domain.Recommendations{Recommendations: []string{"revise ch 3"}}, nil
}

func (f *fakeAiUsecase) CompleteDocumentParse(prompt string, images []usecase.DocumentImage) (string, error) {
	return "", fmt.Errorf("unused")
}

func (f *fakeAiUsecase) ChatExplain(req domain.AiChatExplainRequest) (string, error) {
	f.explainCalls++
	return "Guided explanation for: " + req.Focus.QuestionText, nil
}

func (f *fakeAiUsecase) PracticeSubjects() ([]string, error) {
	f.bankSubjectCalls++
	return []string{"Math", "Physics"}, nil
}

func (f *fakeAiUsecase) PracticeBankQuestions(subject, topic string, count int) ([]domain.Question, error) {
	f.bankCalls++
	return []domain.Question{{QuestionText: "bank question", MultipleChoice: []string{"a", "b", "c", "d"}, Answer: 1}}, nil
}

// signStudentJWT mints a student session JWT with an explicit secret (the
// shared signStudentToken in telegram_auth_handler_test.go pins the test
// secret; the foreign-secret gate case needs to override it).
func signStudentJWT(t *testing.T, secret []byte, userID string, exp time.Time) string {
	t.Helper()
	claims := domain.CustomClaims{
		UserID: userID,
		Role:   StudentRole,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	s, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
	if err != nil {
		t.Fatalf("sign student token: %v", err)
	}
	return s
}

func newAiGateTestServer(t *testing.T) (*gin.Engine, *fakeAiUsecase, *aiSettingsStub) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	fake := &fakeAiUsecase{}
	access := newAiSettingsStub()
	h := NewAiHandler(fake, access, aiAdminSecret)
	r := gin.New()
	h.RegisterRoutes(r.Group("/api/ai"))
	return r, fake, access
}

// doBearer posts a JSON body with an Authorization: Bearer <token> header.
func doBearer(r *gin.Engine, method, path, body, bearer string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+bearer)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestAiGateSwitchOffKeepsSurfacePublic(t *testing.T) {
	r, fake, access := newAiGateTestServer(t)
	access.settings.RequirePremium = false

	w := doReq(r, http.MethodPost, "/api/ai/practice", strings.NewReader(`{"subject":"Math","difficulty":"easy"}`), nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"questions"`) {
		t.Fatalf("response shape changed: %s", w.Body.String())
	}
	if fake.practiceCalls != 1 {
		t.Fatalf("practiceCalls = %d, want 1", fake.practiceCalls)
	}

	w = doReq(r, http.MethodPost, "/api/ai/getRecommendation", strings.NewReader(`{"subject":"Math"}`), nil)
	if w.Code != http.StatusOK || fake.recoCalls != 1 {
		t.Fatalf("reco: status %d calls %d body %s", w.Code, fake.recoCalls, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"recommendation"`) {
		t.Fatalf("reco shape changed: %s", w.Body.String())
	}
}

func TestAiGatePremiumRequired(t *testing.T) {
	body := strings.NewReader(`{"subject":"Math","difficulty":"easy"}`)

	t.Run("anonymous is 403 with the exact upgrade message", func(t *testing.T) {
		r, fake, access := newAiGateTestServer(t)
		access.settings.RequirePremium = true
		w := doReq(r, http.MethodPost, "/api/ai/practice", body, nil)
		if w.Code != http.StatusForbidden {
			t.Fatalf("status = %d body %s", w.Code, w.Body.String())
		}
		var out map[string]string
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		if out["error"] != aiPremiumRequiredMessage {
			t.Fatalf("error = %q, want the contract message %q", out["error"], aiPremiumRequiredMessage)
		}
		if fake.practiceCalls != 0 {
			t.Fatal("blocked request must not reach the paid generation path")
		}
	})

	t.Run("invalid and foreign-secret tokens are 403", func(t *testing.T) {
		r, _, access := newAiGateTestServer(t)
		access.settings.RequirePremium = true
		w := doBearer(r, http.MethodPost, "/api/ai/practice", `{"subject":"Math"}`, "garbage")
		if w.Code != http.StatusForbidden {
			t.Fatalf("garbage token status = %d", w.Code)
		}
		w = doBearer(r, http.MethodPost, "/api/ai/practice", `{"subject":"Math"}`,
			signStudentJWT(t, []byte("other-secret"), "123", time.Now().Add(time.Hour)))
		if w.Code != http.StatusForbidden {
			t.Fatalf("foreign-secret token status = %d, want 403", w.Code)
		}
	})

	t.Run("expired student token is 403", func(t *testing.T) {
		r, _, access := newAiGateTestServer(t)
		access.settings.RequirePremium = true
		w := doBearer(r, http.MethodPost, "/api/ai/practice", `{"subject":"Math"}`,
			signStudentJWT(t, []byte(aiAdminSecret), "123", time.Now().Add(-time.Hour)))
		if w.Code != http.StatusForbidden {
			t.Fatalf("expired token status = %d, want 403", w.Code)
		}
	})

	t.Run("free student is 403, premium student passes", func(t *testing.T) {
		r, fake, access := newAiGateTestServer(t)
		access.settings.RequirePremium = true
		access.premium["900"] = true

		w := doBearer(r, http.MethodPost, "/api/ai/practice", `{"subject":"Math","difficulty":"easy"}`,
			signStudentJWT(t, []byte(aiAdminSecret), "123", time.Now().Add(time.Hour)))
		if w.Code != http.StatusForbidden || fake.practiceCalls != 0 {
			t.Fatalf("free student: status %d calls %d", w.Code, fake.practiceCalls)
		}

		w = doBearer(r, http.MethodPost, "/api/ai/practice", `{"subject":"Math","difficulty":"easy"}`,
			signStudentJWT(t, []byte(aiAdminSecret), "900", time.Now().Add(time.Hour)))
		if w.Code != http.StatusOK || fake.practiceCalls != 1 {
			t.Fatalf("premium student: status %d calls %d body %s", w.Code, fake.practiceCalls, w.Body.String())
		}
	})

	t.Run("student_token cookie works like the bearer header", func(t *testing.T) {
		r, _, access := newAiGateTestServer(t)
		access.settings.RequirePremium = true
		access.premium["900"] = true
		cookie := &http.Cookie{Name: "student_token", Value: signStudentJWT(t, []byte(aiAdminSecret), "900", time.Now().Add(time.Hour))}
		w := doReq(r, http.MethodPost, "/api/ai/practice", strings.NewReader(`{"subject":"Math","difficulty":"easy"}`), cookie)
		if w.Code != http.StatusOK {
			t.Fatalf("cookie premium status = %d body %s", w.Code, w.Body.String())
		}
	})

	t.Run("admin session cookie counts as free non-premium", func(t *testing.T) {
		r, _, access := newAiGateTestServer(t)
		access.settings.RequirePremium = true
		w := doReq(r, http.MethodPost, "/api/ai/practice", strings.NewReader(`{"subject":"Math","difficulty":"easy"}`),
			directCookie(t))
		if w.Code != http.StatusForbidden {
			t.Fatalf("admin cookie status = %d, want 403 (admins are not premium students)", w.Code)
		}
	})

	t.Run("recommendations share the gate", func(t *testing.T) {
		r, fake, access := newAiGateTestServer(t)
		access.settings.RequirePremium = true
		w := doBearer(r, http.MethodPost, "/api/ai/getRecommendation", `{"subject":"Math"}`,
			signStudentJWT(t, []byte(aiAdminSecret), "123", time.Now().Add(time.Hour)))
		if w.Code != http.StatusForbidden || fake.recoCalls != 0 {
			t.Fatalf("free student reco: status %d calls %d", w.Code, fake.recoCalls)
		}
		access.premium["123"] = true
		w = doBearer(r, http.MethodPost, "/api/ai/getRecommendation", `{"subject":"Math"}`,
			signStudentJWT(t, []byte(aiAdminSecret), "123", time.Now().Add(time.Hour)))
		if w.Code != http.StatusOK || fake.recoCalls != 1 {
			t.Fatalf("premium reco: status %d calls %d", w.Code, fake.recoCalls)
		}
	})
}

// /explain shares the premium gate: public when the switch is off, 403 with
// the exact upgrade message when it is on, and the paid ChatExplain path is
// only reached when the gate passes.
func TestExplainEndpointGatesOnPremium(t *testing.T) {
	const body = `{"quiz":[],"focus":{"question_text":"2+2?","multiple_choice":["3","4","5","6"],"answer":1},"ask_text":""}`

	t.Run("public when switch off", func(t *testing.T) {
		r, fake, access := newAiGateTestServer(t)
		access.settings.RequirePremium = false
		w := doReq(r, http.MethodPost, "/api/ai/explain", strings.NewReader(body), nil)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d body %s", w.Code, w.Body.String())
		}
		var out map[string]string
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(out["reply"], "Guided explanation") {
			t.Fatalf("reply = %q, want the canned tutor reply", out["reply"])
		}
		if fake.explainCalls != 1 {
			t.Fatalf("explainCalls = %d, want 1", fake.explainCalls)
		}
	})

	t.Run("403 with exact message when on (free / anonymous)", func(t *testing.T) {
		r, fake, access := newAiGateTestServer(t)
		access.settings.RequirePremium = true
		w := doReq(r, http.MethodPost, "/api/ai/explain", strings.NewReader(body), nil)
		if w.Code != http.StatusForbidden {
			t.Fatalf("status = %d body %s", w.Code, w.Body.String())
		}
		var out map[string]string
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		if out["error"] != aiPremiumRequiredMessage {
			t.Fatalf("error = %q, want the contract message %q", out["error"], aiPremiumRequiredMessage)
		}
		if fake.explainCalls != 0 {
			t.Fatal("blocked request must not reach the paid tutor path")
		}
	})

	t.Run("premium student passes", func(t *testing.T) {
		r, fake, access := newAiGateTestServer(t)
		access.settings.RequirePremium = true
		access.premium["900"] = true
		w := doBearer(r, http.MethodPost, "/api/ai/explain", body,
			signStudentJWT(t, []byte(aiAdminSecret), "900", time.Now().Add(time.Hour)))
		if w.Code != http.StatusOK || fake.explainCalls != 1 {
			t.Fatalf("premium explain: status %d calls %d body %s", w.Code, fake.explainCalls, w.Body.String())
		}
	})

	t.Run("malformed body is 400, not 403/500", func(t *testing.T) {
		r, _, access := newAiGateTestServer(t)
		access.settings.RequirePremium = false
		w := doReq(r, http.MethodPost, "/api/ai/explain", strings.NewReader(`{not json`), nil)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("status = %d body %s", w.Code, w.Body.String())
		}
	})
}

// /settings is public and reflects the switch state (fail-open when the
// settings source is unavailable).
func TestExplainSettingsEndpointIsPublic(t *testing.T) {
	r, _, access := newAiGateTestServer(t)

	access.settings.RequirePremium = false
	w := doReq(r, http.MethodGet, "/api/ai/settings", nil, nil)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"require_premium":false`) {
		t.Fatalf("status %d body %s", w.Code, w.Body.String())
	}

	access.settings.RequirePremium = true
	w = doReq(r, http.MethodGet, "/api/ai/settings", nil, nil)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"require_premium":true`) {
		t.Fatalf("status %d body %s", w.Code, w.Body.String())
	}
}

// /subjects is public (it is not AI work, just a bank inventory) and lists the
// subjects that have stored questions.
func TestPracticeSubjectsEndpointIsPublic(t *testing.T) {
	r, fake, _ := newAiGateTestServer(t)
	w := doReq(r, http.MethodGet, "/api/ai/subjects", nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"subjects"`) {
		t.Fatalf("missing subjects key: %s", w.Body.String())
	}
	if fake.bankSubjectCalls != 1 {
		t.Fatalf("bankSubjectCalls = %d, want 1", fake.bankSubjectCalls)
	}
}

// /practice-questions shares the premium gate and pulls from the stored bank.
func TestPracticeBankQuestionsGatesOnPremium(t *testing.T) {
	const body = `{"subject":"Math","question_count":5}`

	t.Run("public when switch off", func(t *testing.T) {
		r, fake, access := newAiGateTestServer(t)
		access.settings.RequirePremium = false
		w := doReq(r, http.MethodPost, "/api/ai/practice-questions", strings.NewReader(body), nil)
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d body %s", w.Code, w.Body.String())
		}
		if !strings.Contains(w.Body.String(), `"questions"`) {
			t.Fatalf("missing questions key: %s", w.Body.String())
		}
		if fake.bankCalls != 1 {
			t.Fatalf("bankCalls = %d, want 1", fake.bankCalls)
		}
	})

	t.Run("403 when premium required and caller is free", func(t *testing.T) {
		r, fake, access := newAiGateTestServer(t)
		access.settings.RequirePremium = true
		w := doReq(r, http.MethodPost, "/api/ai/practice-questions", strings.NewReader(body), nil)
		if w.Code != http.StatusForbidden {
			t.Fatalf("status = %d body %s", w.Code, w.Body.String())
		}
		if fake.bankCalls != 0 {
			t.Fatal("blocked request must not reach the bank path")
		}
	})

	t.Run("missing subject is 400 (not 500)", func(t *testing.T) {
		r, _, access := newAiGateTestServer(t)
		access.settings.RequirePremium = false
		w := doReq(r, http.MethodPost, "/api/ai/practice-questions", strings.NewReader(`{}`), nil)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("status = %d body %s", w.Code, w.Body.String())
		}
	})
}
