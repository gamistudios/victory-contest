package http

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"victor-contest-go/internal/repository"
	"victor-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// fakePaymentDeleteUsecase embeds the PaymentUsecase interface so it only
// needs to implement DeletePayment for the delete handler tests.
type fakePaymentDeleteUsecase struct {
	usecase.PaymentUsecase

	calls   []string
	err     error
	deleted map[string]bool
}

func (f *fakePaymentDeleteUsecase) DeletePayment(id string) error {
	f.calls = append(f.calls, id)
	if f.err != nil {
		return f.err
	}
	if !f.deleted[id] {
		return usecase.ErrPaymentNotFound
	}
	return nil
}

func newPaymentDeleteRouter(f *fakePaymentDeleteUsecase) *gin.Engine {
	r := newTestRouter()
	NewPaymentHandler(f, repository.ImageRepository{}).RegisterRoutes(r.Group("/api/payment"))
	return r
}

func deletePaymentReq(t *testing.T, r *gin.Engine, id string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodDelete, "/api/payment/"+id, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestPaymentDeleteExistingReturns200Success(t *testing.T) {
	fake := &fakePaymentDeleteUsecase{deleted: map[string]bool{"pay-1": true}}
	r := newPaymentDeleteRouter(fake)

	w := deletePaymentReq(t, r, "pay-1")

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if len(fake.calls) != 1 || fake.calls[0] != "pay-1" {
		t.Fatalf("expected one DeletePayment(pay-1) call, got %v", fake.calls)
	}
	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("bad JSON: %v", err)
	}
	if body["message"] != "success" {
		t.Fatalf("body = %s, want message=success", w.Body.String())
	}
}

func TestPaymentDeleteMissingReturns404(t *testing.T) {
	fake := &fakePaymentDeleteUsecase{deleted: map[string]bool{}}
	r := newPaymentDeleteRouter(fake)

	w := deletePaymentReq(t, r, "nope")

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
}

// TestPaymentDeleteWrappedNotFoundReturns404 guards the errors.Is unwrapping:
// the repository wraps the sentinel (fmt.Errorf("%w")), the handler must still
// answer 404, not 500.
func TestPaymentDeleteWrappedNotFoundReturns404(t *testing.T) {
	fake := &fakePaymentDeleteUsecase{
		err: fmt.Errorf("delete payment pay-1: %w", usecase.ErrPaymentNotFound),
	}
	r := newPaymentDeleteRouter(fake)

	w := deletePaymentReq(t, r, "pay-1")

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
}

func TestPaymentDeleteInternalErrorReturns500(t *testing.T) {
	fake := &fakePaymentDeleteUsecase{err: errors.New("dynamodb down")}
	r := newPaymentDeleteRouter(fake)

	w := deletePaymentReq(t, r, "pay-1")

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
}
