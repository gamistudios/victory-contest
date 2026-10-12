package http

import (
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"

	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// The Academy API is mounted inside NewRouter, which needs a live DynamoDB
// client, so a route collision in RegisterRoutes would only surface as a gin
// panic when the server boots. This test mounts the same group on a bare engine
// (no middleware, no usecase calls) and asserts every documented route exists,
// so a broken or shadowed path fails in `go test` instead of at startup.
func TestAcademyRoutesRegisterWithoutPanic(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// NewAcademyUsecase only stores its dependencies, so nils are safe here:
	// registration never touches the repository, student or AI usecase.
	engine := gin.New()
	NewAcademyHandler(usecase.NewAcademyUsecase(nil, nil, nil)).
		RegisterRoutes(engine.Group("/api/academy"), nil, nil, nil)

	mounted := make(map[string]bool)
	for _, r := range engine.Routes() {
		mounted[r.Method+" "+r.Path] = true
	}

	want := []string{
		// student surface (Bearer student session JWT)
		"GET /api/academy/me",
		"PATCH /api/academy/me",
		"PUT /api/academy/me/target",
		"GET /api/academy/dashboard",
		"GET /api/academy/programs",
		"GET /api/academy/subjects",
		"GET /api/academy/subjects/:id",
		"GET /api/academy/modules/:id",
		"POST /api/academy/modules/:id/progress",
		"POST /api/academy/modules/:id/complete",
		"POST /api/academy/referrals/claim",
		"POST /api/academy/flashcard-reviews",
		"POST /api/academy/quiz-attempts",
		"GET /api/academy/quiz-attempts",
		"POST /api/academy/ai/flashcards",
		"POST /api/academy/ai/quiz",
		"POST /api/academy/ai/tutor",
		// admin surface (admin cookie)
		"GET /api/academy/admin/tree",
		"GET /api/academy/admin/modules/:id",
		"POST /api/academy/admin/modules",
		"PUT /api/academy/admin/modules/:id",
		"DELETE /api/academy/admin/modules/:id",
		"POST /api/academy/admin/modules/:id/duplicate",
		"PATCH /api/academy/admin/modules/:id/access",
		"PATCH /api/academy/admin/modules/:id/status",
		"POST /api/academy/admin/modules/:id/reorder",
		"POST /api/academy/admin/chapters",
		"PUT /api/academy/admin/chapters/:id",
		"DELETE /api/academy/admin/chapters/:id",
		"POST /api/academy/admin/chapters/:id/reorder",
		"POST /api/academy/admin/subjects",
		"PATCH /api/academy/admin/programs/:id",
		"POST /api/academy/admin/ai/generate",
		"GET /api/academy/admin/ai-drafts",
		"PATCH /api/academy/admin/ai-drafts/:id",
		"DELETE /api/academy/admin/ai-drafts/:id",
		"GET /api/academy/admin/analytics",
	}
	var missing []string
	for _, w := range want {
		if !mounted[w] {
			missing = append(missing, w)
		}
	}
	if len(missing) > 0 {
		got := make([]string, 0, len(mounted))
		for k := range mounted {
			got = append(got, k)
		}
		sort.Strings(got)
		t.Fatalf("missing academy routes: %s\nmounted routes:\n  %s",
			strings.Join(missing, ", "), strings.Join(got, "\n  "))
	}
}

// Every /academy route except the /admin group is student-session data, and the
// /admin group is admin-only, so no route may be registered on the bare group
// without a middleware chain. NewRouter passes both middlewares; this checks the
// grouping RegisterRoutes builds actually applies them (a route added outside
// `st`/`ad` would ship ungated).
//
// The middlewares abort the chain, so the handlers themselves never run: with nil
// dependencies registered above they would panic instead of answering.
func TestAcademyRoutesAreGatedByMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	gated := map[string]int{}
	studentMw := gin.HandlerFunc(func(c *gin.Context) {
		gated["student"]++
		c.AbortWithStatus(http.StatusNoContent)
	})
	adminMw := gin.HandlerFunc(func(c *gin.Context) {
		gated["admin"]++
		c.AbortWithStatus(http.StatusNoContent)
	})

	engine := gin.New()
	NewAcademyHandler(usecase.NewAcademyUsecase(nil, nil, nil)).
		RegisterRoutes(engine.Group("/api/academy"), studentMw, adminMw, nil)

	studentPath := "/api/academy/programs"
	if code, body := serveGET(t, engine, studentPath); gated["student"] != 1 {
		t.Errorf("student route ran without studentAuth: %s (status %d, body %s)", studentPath, code, body)
	}

	gated = map[string]int{}
	adminPath := "/api/academy/admin/tree"
	if code, body := serveGET(t, engine, adminPath); gated["admin"] != 1 {
		t.Errorf("admin route ran without adminAuth: %s (status %d, body %s)", adminPath, code, body)
	}
	if gated["student"] != 0 {
		t.Errorf("admin route sits inside the student chain, so an admin cookie would be rejected")
	}
}

// serveGET performs one request against the engine and reports the status code
// and body (used in failure messages only).
func serveGET(t *testing.T, engine *gin.Engine, path string) (int, string) {
	t.Helper()
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
	return recorder.Code, recorder.Body.String()
}
