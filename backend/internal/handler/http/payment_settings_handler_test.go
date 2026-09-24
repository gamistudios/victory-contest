package http

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// paymentSettingsHandlerStub is an in-memory PaymentSettingsUsecase for the
// route-level tests.
type paymentSettingsHandlerStub struct {
	settings domain.PaymentSettings
}

func (s *paymentSettingsHandlerStub) GetSettings() (domain.PaymentSettings, error) {
	return s.settings, nil
}
func (s *paymentSettingsHandlerStub) SaveSettings(v domain.PaymentSettings) error {
	s.settings = v
	return nil
}
func (s *paymentSettingsHandlerStub) AllowStars() bool { return s.settings.AllowStars }
func (s *paymentSettingsHandlerStub) StarsAmount() int { return s.settings.StarsAmount }

const paymentAdminSecret = "pay-admin-secret"

func newPaymentSettingsTestServer(t *testing.T) (*gin.Engine, *paymentSettingsHandlerStub) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	stub := &paymentSettingsHandlerStub{}
	h := NewPaymentSettingsHandler(stub)
	r := gin.New()
	h.RegisterRoutes(r.Group("/api"), adminAuth([]byte(paymentAdminSecret)))
	return r, stub
}

func paymentAdminCookie(t *testing.T) *http.Cookie {
	t.Helper()
	return &http.Cookie{Name: "token", Value: signToken(t, []byte(paymentAdminSecret), "admin@x.et", time.Now().Add(time.Hour))}
}

// The admin settings routes are gated; the public read is not.
func TestPaymentSettingsAdminRoutesRequireAuth(t *testing.T) {
	r, _ := newPaymentSettingsTestServer(t)
	for _, tc := range []struct{ method, path, body string }{
		{http.MethodGet, "/api/payment-admin/settings", ""},
		{http.MethodPut, "/api/payment-admin/settings", `{"allow_stars":true}`},
	} {
		var body *strings.Reader
		if tc.body != "" {
			body = strings.NewReader(tc.body)
			w := doReq(r, tc.method, tc.path, body, nil)
			if w.Code != http.StatusUnauthorized {
				t.Fatalf("%s %s status = %d, want 401", tc.method, tc.path, w.Code)
			}
			continue
		}
		w := doReq(r, tc.method, tc.path, nil, nil)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s status = %d, want 401", tc.method, tc.path, w.Code)
		}
	}
}

// A student read needs no cookie and, with nothing saved, reports Stars hidden
// and reveals only the allow_stars flag (never the amount).
func TestPaymentSettingsPublicReadUnauthenticated(t *testing.T) {
	r, _ := newPaymentSettingsTestServer(t)
	w := doReq(r, http.MethodGet, "/api/payment/settings", nil, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("public GET status = %d body %s", w.Code, w.Body.String())
	}
	var view map[string]json.RawMessage
	if err := json.Unmarshal(w.Body.Bytes(), &view); err != nil {
		t.Fatal(err)
	}
	if len(view) != 1 {
		t.Fatalf("public read leaked fields: %s", w.Body.String())
	}
	if string(view["allow_stars"]) != "false" {
		t.Fatalf("unset settings must report allow_stars=false, got %s", w.Body.String())
	}
}

// GET/PUT round-trips the switch and the amount; malformed bodies are 400.
func TestPaymentSettingsAdminRoundTrip(t *testing.T) {
	r, _ := newPaymentSettingsTestServer(t)
	cookie := paymentAdminCookie(t)

	w := doReq(r, http.MethodPut, "/api/payment-admin/settings", strings.NewReader(`{"allow_stars":true,"stars_amount":80}`), cookie)
	if w.Code != http.StatusOK {
		t.Fatalf("PUT status = %d body %s", w.Code, w.Body.String())
	}

	w = doReq(r, http.MethodGet, "/api/payment-admin/settings", nil, cookie)
	var view struct {
		AllowStars  bool `json:"allow_stars"`
		StarsAmount int  `json:"stars_amount"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &view); err != nil {
		t.Fatal(err)
	}
	if !view.AllowStars || view.StarsAmount != 80 {
		t.Fatalf("round-trip lost the flag/amount: %+v", view)
	}

	// Public read now reveals the flag only.
	w = doReq(r, http.MethodGet, "/api/payment/settings", nil, nil)
	if !strings.Contains(w.Body.String(), `"allow_stars":true`) {
		t.Fatalf("public read after enable: %s", w.Body.String())
	}

	// Malformed body → 400.
	w = doReq(r, http.MethodPut, "/api/payment-admin/settings", strings.NewReader(`{"allow_stars":"yes"}`), cookie)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("bad body status = %d body %s", w.Code, w.Body.String())
	}

	// Switch back off.
	w = doReq(r, http.MethodPut, "/api/payment-admin/settings", strings.NewReader(`{"allow_stars":false,"stars_amount":0}`), cookie)
	if w.Code != http.StatusOK {
		t.Fatalf("PUT off status = %d", w.Code)
	}
	w = doReq(r, http.MethodGet, "/api/payment/settings", nil, nil)
	if strings.Contains(w.Body.String(), `"allow_stars":true`) {
		t.Fatalf("after off public read: %s", w.Body.String())
	}
}

var _ usecase.PaymentSettingsUsecase = (*paymentSettingsHandlerStub)(nil)
