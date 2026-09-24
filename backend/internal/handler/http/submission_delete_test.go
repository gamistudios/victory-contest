package http

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// fakeSubmissionDeleteUsecase embeds the SubmissionUsecase interface so it only
// needs to implement DeleteSubmission for the delete handler tests.
type fakeSubmissionDeleteUsecase struct {
	usecase.SubmissionUsecase

	calls   []string
	err     error
	deleted map[string]bool
}

func (f *fakeSubmissionDeleteUsecase) DeleteSubmission(id string) error {
	f.calls = append(f.calls, id)
	if f.err != nil {
		return f.err
	}
	if !f.deleted[id] {
		return usecase.ErrSubmissionNotFound
	}
	return nil
}

func newSubmissionDeleteRouter(f *fakeSubmissionDeleteUsecase) *gin.Engine {
	r := newTestRouter()
	NewSubmissionHandler(f).RegisterRoutes(r.Group("/api/submission"))
	return r
}

func deleteSubmissionReq(t *testing.T, r *gin.Engine, id string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodDelete, "/api/submission/"+id, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestSubmissionDeleteExistingReturns200Success(t *testing.T) {
	fake := &fakeSubmissionDeleteUsecase{deleted: map[string]bool{"sub-1": true}}
	r := newSubmissionDeleteRouter(fake)

	w := deleteSubmissionReq(t, r, "sub-1")

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if len(fake.calls) != 1 || fake.calls[0] != "sub-1" {
		t.Fatalf("expected one DeleteSubmission(sub-1) call, got %v", fake.calls)
	}
	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("bad JSON: %v", err)
	}
	if body["message"] != "success" {
		t.Fatalf("body = %s, want message=success", w.Body.String())
	}
}

func TestSubmissionDeleteMissingReturns404(t *testing.T) {
	fake := &fakeSubmissionDeleteUsecase{deleted: map[string]bool{}}
	r := newSubmissionDeleteRouter(fake)

	w := deleteSubmissionReq(t, r, "nope")

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
}

// TestSubmissionDeleteWrappedNotFoundReturns404 guards the errors.Is unwrapping:
// the repository wraps the sentinel (fmt.Errorf("%w")), the handler must still
// answer 404, not 500.
func TestSubmissionDeleteWrappedNotFoundReturns404(t *testing.T) {
	fake := &fakeSubmissionDeleteUsecase{
		err: fmt.Errorf("delete submission sub-1: %w", usecase.ErrSubmissionNotFound),
	}
	r := newSubmissionDeleteRouter(fake)

	w := deleteSubmissionReq(t, r, "sub-1")

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
}

func TestSubmissionDeleteInternalErrorReturns500(t *testing.T) {
	fake := &fakeSubmissionDeleteUsecase{err: errors.New("dynamodb down")}
	r := newSubmissionDeleteRouter(fake)

	w := deleteSubmissionReq(t, r, "sub-1")

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
}
