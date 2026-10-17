package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/repository"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// Handler-level coverage for the Phase 3 question-bank routes (plan §5.6): the admin
// gate, the assign-scope validation/response shape, and the per-question usage read.

const qbTestSecret = "question-bank-test-secret"

type qbUsecase struct {
	updated []string
	failed  map[string]string
}

func (qbUsecase) AddQuestion(domain.Question) (string, error)                 { return "", nil }
func (qbUsecase) UpdateQuestion(string, domain.QuestionPatch) error           { return nil }
func (qbUsecase) DeleteQuestion(string) error                                 { return nil }
func (qbUsecase) DeleteQuestions([]string) (*usecase.BulkDeleteResult, error) { return nil, nil }
func (qbUsecase) GetQuestionByID(string) (*domain.Question, error)            { return nil, nil }
func (qbUsecase) GetAllQuestions() ([]domain.Question, error)                 { return nil, nil }
func (qbUsecase) AddMultipleQuestions([]domain.Question) error                { return nil }
func (u qbUsecase) AssignScope(_ []string, _ domain.Scope) ([]string, map[string]string) {
	return u.updated, u.failed
}

type qbContests struct{ all []domain.Contest }

func (c qbContests) GetAllContests() ([]domain.Contest, error) { return c.all, nil }

func qbEngine(u usecase.QuestionUsecase, contests interface {
	GetAllContests() ([]domain.Contest, error)
}) *gin.Engine {
	h := NewQuestionHandler(u, (*repository.ImageRepository)(nil), nil)
	if contests != nil {
		h.contests = contests
	}
	r := gin.New()
	h.RegisterRoutes(r.Group("/api/question"), adminAuth([]byte(qbTestSecret)))
	return r
}

func qbAdminReq(method, target, body string) *http.Request {
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: "token", Value: func() string {
		claims := domain.CustomClaims{UserID: "admin@example.com",
			RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}}
		s, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(qbTestSecret))
		if err != nil {
			panic(err)
		}
		return s
	}()})
	return req
}

func TestAssignScopeRequiresAdmin(t *testing.T) {
	w := httptest.NewRecorder()
	qbEngine(qbUsecase{}, nil).ServeHTTP(w,
		httptest.NewRequest(http.MethodPost, "/api/question/assign-scope", strings.NewReader(`{}`)))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("assign-scope without admin = %d, want 401", w.Code)
	}
}

func TestAssignScopeValidatesBody(t *testing.T) {
	// ids present but no program_id -> 400.
	w := httptest.NewRecorder()
	qbEngine(qbUsecase{}, nil).ServeHTTP(w,
		qbAdminReq(http.MethodPost, "/api/question/assign-scope", `{"ids":["q1"],"scope":{"stream_id":"natural"}}`))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("missing program_id = %d, want 400: %s", w.Code, w.Body.String())
	}
}

func TestAssignScopeReportsPerIDResults(t *testing.T) {
	u := qbUsecase{updated: []string{"q1"}, failed: map[string]string{"q2": "not found"}}
	w := httptest.NewRecorder()
	qbEngine(u, nil).ServeHTTP(w,
		qbAdminReq(http.MethodPost, "/api/question/assign-scope",
			`{"ids":["q1","q2"],"scope":{"program_id":"g12","stream_id":"natural"}}`))
	if w.Code != http.StatusOK {
		t.Fatalf("assign-scope = %d, want 200: %s", w.Code, w.Body.String())
	}
	var body struct {
		Updated []string          `json:"updated"`
		Failed  map[string]string `json:"failed"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("body: %v", err)
	}
	if len(body.Updated) != 1 || body.Failed["q2"] == "" {
		t.Fatalf("assign-scope body = %+v, want updated=[q1] failed[q2]", body)
	}
}

func TestQuestionUsageCountsContests(t *testing.T) {
	contests := qbContests{all: []domain.Contest{
		{ID: "c1", Title: "Midterm", Questions: []string{"q1", "q2"}},
		{ID: "c2", Title: "Final", Questions: []string{"q3"}},
	}}
	w := httptest.NewRecorder()
	qbEngine(qbUsecase{}, contests).ServeHTTP(w,
		qbAdminReq(http.MethodGet, "/api/question/q1/usage", ""))
	if w.Code != http.StatusOK {
		t.Fatalf("usage = %d, want 200: %s", w.Code, w.Body.String())
	}
	var body struct {
		Count int `json:"count"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("body: %v", err)
	}
	if body.Count != 1 {
		t.Fatalf("usage count = %d, want 1 (only c1 references q1)", body.Count)
	}
}
