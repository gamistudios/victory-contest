package http

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"victor-contest-go/internal/domain"
	"victor-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// fakeFeedbackResponseLookup returns "not found" (nil, nil) for any id,
// mirroring the DynamoDB repository's GetItem behavior for a missing key.
type fakeFeedbackResponseLookup struct {
	usecase.FeedbackResponseUsecase
}

func (fakeFeedbackResponseLookup) GetFeedbackResponseByID(string) (*domain.FeedbackResponse, error) {
	return nil, nil
}

// #48: the `GET /feedback-response/test` debug endpoint must be gone. The
// route/handler were deleted; /test now falls through to the :id lookup, which
// answers 404 for the non-existent "test" record.
func TestFeedbackResponseTestEndpointRemoved(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := newTestRouter()
	NewFeedbackResponseHandler(&fakeFeedbackResponseLookup{}, nil).
		RegisterRoutes(r.Group("/api/feedback-response"))

	req := httptest.NewRequest(http.MethodGet, "/api/feedback-response/test", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("GET /api/feedback-response/test: status = %d, want 404 (debug endpoint should be removed), body = %s",
			w.Code, w.Body.String())
	}
	if body := w.Body.String(); strings.Contains(body, "Test endpoint working") || strings.Contains(body, `"timestamp"`) {
		t.Fatalf("debug endpoint payload still served: %s", body)
	}
}
