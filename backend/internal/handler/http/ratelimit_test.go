package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"victor-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

var _ usecase.TelegramUsecase = (*fakeTelegramUsecase)(nil)

func TestTokenLimiterRefills(t *testing.T) {
	// 60/min, burst 3 — 3 immediate allows, then blocked; a fake-time jump
	// refills at 1 token/s.
	l := newTokenLimiter(60, 3)
	now := time.Unix(1700000000, 0)
	l.now = func() time.Time { return now }

	for i := 0; i < 3; i++ {
		if !l.allow("1.2.3.4") {
			t.Fatalf("request %d should be allowed (burst 3)", i+1)
		}
	}
	if l.allow("1.2.3.4") {
		t.Fatal("4th request should be limited")
	}
	if !l.allow("5.6.7.8") {
		t.Fatal("a different client must have its own bucket")
	}
	now = now.Add(time.Second) // refills exactly 1 token at 1/s
	if !l.allow("1.2.3.4") {
		t.Fatal("request should be allowed after refill")
	}
	if l.allow("1.2.3.4") {
		t.Fatal("only one token should have refilled")
	}
}

func TestRateLimitMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/limited", rateLimitByClientIP(1, 1), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	// 1 request/min per client: each IP's first request passes, a second
	// from the same IP is 429, a fresh IP is unaffected.
	req := httptest.NewRequest(http.MethodPost, "/limited", nil)
	req.RemoteAddr = "9.9.9.1:1234"
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("first request: status = %d, want 200", w.Code)
	}

	req = httptest.NewRequest(http.MethodPost, "/limited", nil)
	req.RemoteAddr = "9.9.9.2:1234"
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("other IP first request: status = %d, want 200", w.Code)
	}

	req = httptest.NewRequest(http.MethodPost, "/limited", nil)
	req.RemoteAddr = "9.9.9.1:1234"
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("2nd request from 9.9.9.1: status = %d, want 429", w.Code)
	}
}

type fakeTelegramUsecase struct{ got int }

func (f *fakeTelegramUsecase) HandleStartCommand(chatId, userId int64) error { return nil }
func (f *fakeTelegramUsecase) TakeUpdate(tgbotapi.Update) error              { f.got++; return nil }
func (f *fakeTelegramUsecase) CreatePremiumInvoiceLink(string) (string, error) {
	return "", fmt.Errorf("unused")
}
func (f *fakeTelegramUsecase) SavePreparedInlineMessage(int64, json.RawMessage) (json.RawMessage, error) {
	return nil, fmt.Errorf("unused")
}

func TestWebhookSecretVerification(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	fake := &fakeTelegramUsecase{}
	h := &telegramHandler{usecase: fake, webhookSecret: "s3cr3t"}
	r.POST("/webhook", h.Updater)

	post := func(header string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/webhook", strings.NewReader(`{"update_id":1}`))
		req.Header.Set("Content-Type", "application/json")
		if header != "" {
			req.Header.Set("X-Telegram-Bot-Api-Secret-Token", header)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	if w := post(""); w.Code != http.StatusForbidden {
		t.Fatalf("missing secret: status = %d, want 403", w.Code)
	}
	if w := post("wrong"); w.Code != http.StatusForbidden {
		t.Fatalf("wrong secret: status = %d, want 403", w.Code)
	}
	if w := post("s3cr3t"); w.Code != http.StatusOK {
		t.Fatalf("valid secret: status = %d, want 200", w.Code)
	}
	if fake.got != 1 {
		t.Fatalf("TakeUpdate calls = %d, want 1 (only the accepted request)", fake.got)
	}

	// Unconfigured secret keeps the old behavior (accepts) so the API can
	// boot without the env var.
	open := gin.New()
	open.POST("/webhook", (&telegramHandler{usecase: fake}).Updater)
	req := httptest.NewRequest(http.MethodPost, "/webhook", strings.NewReader(`{"update_id":2}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	open.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("secret unset: status = %d, want 200", w.Code)
	}
}
