package http

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// recordingPaymentRepo is an in-memory stand-in for the payment table; the
// TelegramUsecase runs for real on top of it, so successful_payment updates
// flow through the production TakeUpdate path.
type recordingPaymentRepo struct {
	usecase.PaymentRepository
	created []domain.PaymentRequest
	byID    map[string]*domain.PaymentRequest
}

func (f *recordingPaymentRepo) Create(req *domain.PaymentRequest) error {
	f.created = append(f.created, *req)
	if f.byID == nil {
		f.byID = map[string]*domain.PaymentRequest{}
	}
	cp := *req
	f.byID[req.ID] = &cp
	return nil
}

func (f *recordingPaymentRepo) GetByID(id string) (*domain.PaymentRequest, error) {
	if p, ok := f.byID[id]; ok {
		return p, nil
	}
	return nil, errors.New("payment request not found")
}

func successfulPaymentBody(t *testing.T, currency, payload, chargeID string) string {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"update_id": 4242,
		"message": map[string]any{
			"message_id": 7,
			"from":       map[string]any{"id": 999001, "is_bot": false, "first_name": "Ada", "last_name": "Lovelace"},
			"chat":       map[string]any{"id": 999001, "type": "private", "first_name": "Ada"},
			"date":       1757000000,
			"successful_payment": map[string]any{
				"currency":                   currency,
				"total_amount":               50,
				"invoice_payload":            payload,
				"telegram_payment_charge_id": chargeID,
				"provider_payment_charge_id": "stg_" + chargeID,
			},
		},
	})
	if err != nil {
		t.Fatalf("marshal update: %v", err)
	}
	return string(body)
}

// TestWebhookSuccessfulPaymentRecordsPremium replays realistic
// successful_payment updates against POST /api/telegram/webhook with a fake
// bot token in the environment and the secret-token check active: no network
// call to api.telegram.org happens anywhere on this path.
func TestWebhookSuccessfulPaymentRecordsPremium(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("TELEGRAM_BOT_TOKEN", "FAKE_TOKEN_FOR_TESTS:123456")

	repo := &recordingPaymentRepo{}
	telegramUC := usecase.NewTelegramUsecase(nil, nil, usecase.NewPaymentUsecases(repo))
	r := gin.New()
	api := r.Group("/api")
	NewTelegramHandler(telegramUC, "webhook-secret").RegisterRoutes(api.Group("/telegram"))

	post := func(header, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/api/telegram/webhook", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if header != "" {
			req.Header.Set("X-Telegram-Bot-Api-Secret-Token", header)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	happy := successfulPaymentBody(t, "XTR", "premium_999001_rnd123", "chg-live-1")

	if w := post("wrong-secret", happy); w.Code != http.StatusForbidden {
		t.Fatalf("wrong secret: status = %d, want 403", w.Code)
	}
	if len(repo.created) != 0 {
		t.Fatalf("rejected update reached the payment table: %+v", repo.created)
	}

	w := post("webhook-secret", happy)
	if w.Code != http.StatusOK {
		t.Fatalf("valid secret: status = %d, want 200 (body: %s)", w.Code, w.Body.String())
	}
	if len(repo.created) != 1 {
		t.Fatalf("created %d payments, want 1", len(repo.created))
	}
	pay := repo.created[0]
	if pay.Status != domain.StatusApproved || pay.UserID != "999001" || pay.ID != "tgpay_chg-live-1" {
		t.Fatalf("unexpected payment row: %+v", pay)
	}
	if pay.ExpirationDate == nil || !pay.ExpirationDate.After(time.Now().UTC()) {
		t.Fatalf("expiration %v not in the future (UTC)", pay.ExpirationDate)
	}

	// Replay of the identical update must not duplicate or extend.
	firstExp := *pay.ExpirationDate
	if w := post("webhook-secret", happy); w.Code != http.StatusOK {
		t.Fatalf("replay: status = %d, want 200", w.Code)
	}
	if len(repo.created) != 1 {
		t.Fatalf("replay created %d payments, want 1", len(repo.created))
	}
	if got := *repo.created[0].ExpirationDate; !got.Equal(firstExp) {
		t.Fatalf("replay slid the expiration from %v to %v", firstExp, got)
	}

	// Non-Stars currency and unbound payloads are acknowledged but ignored.
	if w := post("webhook-secret", successfulPaymentBody(t, "USD", "premium_999001_rnd123", "chg-usd")); w.Code != http.StatusOK {
		t.Fatalf("USD update: status = %d, want 200", w.Code)
	}
	if w := post("webhook-secret", successfulPaymentBody(t, "XTR", "subscription_deadbeef", "chg-old")); w.Code != http.StatusOK {
		t.Fatalf("legacy payload: status = %d, want 200", w.Code)
	}
	if len(repo.created) != 1 {
		t.Fatalf("ignored updates created payments: %d rows", len(repo.created))
	}
}

// TestInvoiceLinkBindsBuyer checks the POST /api/telegram/invoice-link
// contract: the buyer's Telegram id must reach the usecase (which embeds it
// in the invoice payload), and a request without one is rejected.
func TestInvoiceLinkBindsBuyer(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	api := r.Group("/api")
	NewTelegramHandler(&captureInvoiceUsecase{}, "").RegisterRoutes(api.Group("/telegram"))

	req := httptest.NewRequest(http.MethodPost, "/api/telegram/invoice-link", strings.NewReader(`{"user_id":"515311"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body: %s)", w.Code, w.Body.String())
	}
	if captureInvoiceUsecaseLast != "515311" {
		t.Fatalf("usecase received user_id %q, want 515311", captureInvoiceUsecaseLast)
	}

	req = httptest.NewRequest(http.MethodPost, "/api/telegram/invoice-link", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("missing user_id: status = %d, want 400", w.Code)
	}
}

type captureInvoiceUsecase struct{ usecase.TelegramUsecase }

var captureInvoiceUsecaseLast string

func (f *captureInvoiceUsecase) CreatePremiumInvoiceLink(userID string) (string, error) {
	captureInvoiceUsecaseLast = userID
	return "https://example.invalid/invoice", nil
}
