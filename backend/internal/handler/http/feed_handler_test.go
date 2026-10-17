package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// Handler-level coverage for GET /api/feed (plan §5.7): the auth gate, the HTTP
// status of the forbidden case, and that the resolved view is what the app parses.
// The stream/mine/paging rules themselves live in feed_usecase_test.go; this
// only proves the wiring the two apps rely on.

const feedTestSecret = "feed-test-secret"

// feedEngine builds the route with a student source that either resolves s1 or
// reports the student as unavailable.
func feedEngine(known bool) *gin.Engine {
	st := &domain.Student{
		ID: "s1", PrimaryProgramID: "g12",
		Enrollments: []domain.Enrollment{{ProgramID: "g12", StreamID: "natural"}},
	}
	uc := usecase.NewFeedUsecase(usecase.FeedSources{
		Student: func(_ string) (*domain.Student, error) {
			if known {
				return st, nil
			}
			return nil, usecase.ErrBoardForbidden
		},
		Assessments: func(_ string, _ domain.ScopeFilter) ([]usecase.AssessmentMeta, error) {
			return []usecase.AssessmentMeta{{ID: "a1"}, {ID: "a2"}}, nil
		},
		Subjects: func(_, _, _ string) ([]usecase.AcademySubjectView, error) {
			return nil, nil
		},
		Board: func(_, period, program, _ string) (*usecase.BoardView, error) {
			return &usecase.BoardView{Period: period, ProgramID: program, Entries: []domain.BoardEntry{}}, nil
		},
	})
	h := NewFeedHandler(uc)
	h.studentAuth = studentAuth([]byte(feedTestSecret))
	r := gin.New()
	h.RegisterRoutes(r.Group("/api"))
	return r
}

func feedToken(userID string) string {
	claims := domain.CustomClaims{UserID: userID, Role: StudentRole,
		RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}}
	s, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(feedTestSecret))
	if err != nil {
		panic(err)
	}
	return s
}

func TestFeedHandlerRequiresStudentSession(t *testing.T) {
	w := httptest.NewRecorder()
	feedEngine(true).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/feed", nil))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous /feed = %d, want 401", w.Code)
	}
}

func TestFeedHandlerReturnsResolvedView(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/feed", nil)
	req.Header.Set("Authorization", "Bearer "+feedToken("s1"))
	w := httptest.NewRecorder()
	feedEngine(true).ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("/feed = %d, want 200: %s", w.Code, w.Body.String())
	}
	var v usecase.FeedView
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatalf("body is not a FeedView: %v", err)
	}
	if v.ProgramID != "g12" || !v.Mine || len(v.Assessments) != 2 {
		t.Fatalf("view = %+v, want primary program g12, mine, 2 assessments", v)
	}
}

func TestFeedHandlerForbidsUnknownStudent(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/feed", nil)
	req.Header.Set("Authorization", "Bearer "+feedToken("s1"))
	w := httptest.NewRecorder()
	feedEngine(false).ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("/feed = %d, want 403: %s", w.Code, w.Body.String())
	}
	var body map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	if body["code"] != "forbidden" {
		t.Fatalf("forbidden body = %v, want code=forbidden", body)
	}
}
