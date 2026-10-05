package usecase

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"victory-contest-go/internal/domain"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

// fakeStudentRepo embeds the (large) StudentRepository interface and only
// implements the methods the telegram usecase needs.
type fakeStudentRepo struct {
	StudentRepository
	studentsByTelegramID map[string]*domain.Student
	added                []domain.Student
}

func (f *fakeStudentRepo) GetStudentByTelegramID(telegramID string) (*domain.Student, error) {
	if s, ok := f.studentsByTelegramID[telegramID]; ok {
		return s, nil
	}
	return nil, nil
}

func (f *fakeStudentRepo) AddStudent(student domain.Student) error {
	f.added = append(f.added, student)
	f.studentsByTelegramID[student.TelegramID] = &student
	return nil
}

// TestTakeUpdateNonMessageNoPanic covers #17: any update without a usable
// message (callback_query, edited_message, message without chat/from, bare
// update_id) must be ignored instead of panicking.
func TestTakeUpdateNonMessageNoPanic(t *testing.T) {
	updates := map[string]tgbotapi.Update{
		"empty update":               {UpdateID: 1},
		"callback query only":        {UpdateID: 2, CallbackQuery: &tgbotapi.CallbackQuery{ID: "cb"}},
		"edited message":             {UpdateID: 3, EditedMessage: &tgbotapi.Message{Text: "/start"}},
		"inline query":               {UpdateID: 4, InlineQuery: &tgbotapi.InlineQuery{ID: "iq"}},
		"message without chat":       {UpdateID: 5, Message: &tgbotapi.Message{Text: "/start"}},
		"message without from":       {UpdateID: 6, Message: &tgbotapi.Message{Text: "/start", Chat: &tgbotapi.Chat{ID: 42}}},
		"message other text no from": {UpdateID: 7, Message: &tgbotapi.Message{Text: "hi", Chat: &tgbotapi.Chat{ID: 42}}},
	}

	for name, update := range updates {
		t.Run(name, func(t *testing.T) {
			repo := &fakeStudentRepo{studentsByTelegramID: map[string]*domain.Student{}}
			uc := NewTelegramUsecase(nil, repo, nil)
			if err := uc.TakeUpdate(update); err != nil {
				t.Fatalf("TakeUpdate(%s) returned error: %v", name, err)
			}
		})
	}
}

// TestHandleStartCommandHonorsUserID covers the second half of #17: the user id
// from the update must drive student lookup/registration.
func TestHandleStartCommandHonorsUserID(t *testing.T) {
	t.Run("registers unknown telegram user", func(t *testing.T) {
		repo := &fakeStudentRepo{studentsByTelegramID: map[string]*domain.Student{}}
		uc := &telegramUsecase{studentRepo: repo}

		if err := uc.HandleStartCommand(100, 777001); err != nil {
			t.Fatalf("HandleStartCommand: %v", err)
		}
		if len(repo.added) != 1 || repo.added[0].TelegramID != "777001" {
			t.Fatalf("expected one registered student with telegram_id 777001, got %+v", repo.added)
		}
	})

	t.Run("looks up existing telegram user without duplicating", func(t *testing.T) {
		repo := &fakeStudentRepo{studentsByTelegramID: map[string]*domain.Student{
			"777001": {ID: "student-uuid", TelegramID: "777001", Name: "Existing"},
		}}
		uc := &telegramUsecase{studentRepo: repo}

		if err := uc.HandleStartCommand(100, 777001); err != nil {
			t.Fatalf("HandleStartCommand: %v", err)
		}
		if len(repo.added) != 0 {
			t.Fatalf("expected no new student registered, got %+v", repo.added)
		}
	})

	t.Run("take update wires message user id into start handler", func(t *testing.T) {
		repo := &fakeStudentRepo{studentsByTelegramID: map[string]*domain.Student{}}
		uc := &telegramUsecase{studentRepo: repo}
		update := tgbotapi.Update{
			UpdateID: 9,
			Message: &tgbotapi.Message{
				Text: "/start",
				Chat: &tgbotapi.Chat{ID: 555},
				From: &tgbotapi.User{ID: 888002},
			},
		}
		if err := uc.TakeUpdate(update); err != nil {
			t.Fatalf("TakeUpdate: %v", err)
		}
		if len(repo.added) != 1 || repo.added[0].TelegramID != "888002" {
			t.Fatalf("expected student registered from update.From.ID, got %+v", repo.added)
		}
	})
}

// fakePaymentRepo records Create calls and serves GetByID from what was
// created — enough to exercise ConfirmTelegramStarsPayment end to end through
// the real payment usecase without DynamoDB.
type fakePaymentRepo struct {
	PaymentRepository
	created  []domain.PaymentRequest
	byID     map[string]*domain.PaymentRequest
	createID int
}

func (f *fakePaymentRepo) Create(req *domain.PaymentRequest) error {
	f.created = append(f.created, *req)
	if f.byID == nil {
		f.byID = map[string]*domain.PaymentRequest{}
	}
	cp := *req
	f.byID[req.ID] = &cp
	return nil
}

func (f *fakePaymentRepo) GetByID(id string) (*domain.PaymentRequest, error) {
	if p, ok := f.byID[id]; ok {
		return p, nil
	}
	return nil, errors.New("payment request not found")
}

func TestPremiumPayloadBinding(t *testing.T) {
	t.Run("build/parse round trip", func(t *testing.T) {
		payload, err := buildPremiumPayload("123456789")
		if err != nil {
			t.Fatalf("buildPremiumPayload: %v", err)
		}
		if !strings.HasPrefix(payload, premiumPayloadPrefix) {
			t.Fatalf("payload %q missing prefix", payload)
		}
		if len(payload) > 128 {
			t.Fatalf("payload %q exceeds Telegram's 128-byte limit", payload)
		}
		userID, ok := parsePremiumPayload(payload)
		if !ok || userID != "123456789" {
			t.Fatalf("parsePremiumPayload(%q) = %q, %v; want 123456789, true", payload, userID, ok)
		}
	})

	t.Run("build rejects non-numeric or empty ids", func(t *testing.T) {
		for _, id := range []string{"", "abc", "123;drop", "123 "} {
			if _, err := buildPremiumPayload(id); err == nil {
				t.Fatalf("buildPremiumPayload(%q) accepted invalid id", id)
			}
		}
	})

	t.Run("parse rejects foreign payloads", func(t *testing.T) {
		for _, p := range []string{"", "subscription_deadbeef", "premium_", "premium_123", "premium__abc", "premium_abc_xyz", "Premium_123_abc"} {
			if _, ok := parsePremiumPayload(p); ok {
				t.Fatalf("parsePremiumPayload(%q) = ok; want reject", p)
			}
		}
	})
}

// TestCreatePremiumInvoiceLinkBindsUser asserts the buyer id reaches the
// payload and that bad ids fail before any network call (bot == nil would
// surface "not configured" if validation passed). Stars is switched ON via
// the stub settings so the call proceeds to the (disabled) bot.
func TestCreatePremiumInvoiceLinkBindsUser(t *testing.T) {
	uc := &telegramUsecase{settings: &stubPaymentSettings{allow: true}}
	if _, err := uc.CreatePremiumInvoiceLink("not-a-number"); err == nil {
		t.Fatal("expected invalid user id to be rejected")
	} else if !strings.Contains(err.Error(), "numeric") {
		t.Fatalf("expected validation error, got: %v", err)
	}
	_, err := uc.CreatePremiumInvoiceLink("424242")
	if err == nil || !strings.Contains(err.Error(), "not configured") {
		t.Fatalf("valid id should reach the (disabled) bot call, got: %v", err)
	}
}

// TestCreatePremiumInvoiceLinkBlockedWhenDisabled asserts the global Stars
// switch is checked before any Telegram call: a disabled (or unwired) bot
// must report "disabled", never reach the network.
func TestCreatePremiumInvoiceLinkBlockedWhenDisabled(t *testing.T) {
	uc := &telegramUsecase{settings: &stubPaymentSettings{allow: false}}
	if _, err := uc.CreatePremiumInvoiceLink("424242"); err == nil || !strings.Contains(err.Error(), "disabled") {
		t.Fatalf("allow_stars=false must block the invoice, got: %v", err)
	}
	// Unwired settings (nil) is the same safe default.
	unwired := &telegramUsecase{}
	if _, err := unwired.CreatePremiumInvoiceLink("424242"); err == nil || !strings.Contains(err.Error(), "disabled") {
		t.Fatalf("nil settings must block the invoice, got: %v", err)
	}
}

func TestTakeUpdateSuccessfulPaymentRecordsPremium(t *testing.T) {
	newUpdate := func(currency, payload, chargeID string) tgbotapi.Update {
		return tgbotapi.Update{
			UpdateID: 21,
			Message: &tgbotapi.Message{
				Chat: &tgbotapi.Chat{ID: 555},
				From: &tgbotapi.User{ID: 999001, FirstName: "Ada", LastName: "Lovelace"},
				SuccessfulPayment: &tgbotapi.SuccessfulPayment{
					Currency:                currency,
					TotalAmount:             50,
					InvoicePayload:          payload,
					TelegramPaymentChargeID: chargeID,
				},
			},
		}
	}

	t.Run("happy path marks payment Approved with future UTC expiration", func(t *testing.T) {
		repo := &fakePaymentRepo{}
		uc := &telegramUsecase{paymentUsecase: NewPaymentUsecases(repo)}
		if err := uc.TakeUpdate(newUpdate("XTR", "premium_999001_deadbeef", "chg-1")); err != nil {
			t.Fatalf("TakeUpdate: %v", err)
		}
		if len(repo.created) != 1 {
			t.Fatalf("created %d payments, want 1", len(repo.created))
		}
		pay := repo.created[0]
		if pay.ID != "tgpay_chg-1" || pay.UserID != "999001" {
			t.Fatalf("unexpected key/user: %+v", pay)
		}
		if pay.Status != domain.StatusApproved {
			t.Fatalf("status = %s, want Approved", pay.Status)
		}
		if pay.FullName != "Ada Lovelace" || pay.BankName != "Telegram Stars" {
			t.Fatalf("unexpected payer fields: %+v", pay)
		}
		if pay.ExpirationDate == nil || !pay.ExpirationDate.After(time.Now().UTC()) {
			t.Fatalf("expiration %v not in the future (UTC)", pay.ExpirationDate)
		}
	})

	t.Run("replayed webhook is idempotent", func(t *testing.T) {
		repo := &fakePaymentRepo{}
		uc := &telegramUsecase{paymentUsecase: NewPaymentUsecases(repo)}
		update := newUpdate("XTR", "premium_999001_deadbeef", "chg-dup")
		if err := uc.TakeUpdate(update); err != nil {
			t.Fatalf("first TakeUpdate: %v", err)
		}
		firstExp := repo.created[0].ExpirationDate
		if err := uc.TakeUpdate(update); err != nil {
			t.Fatalf("replay TakeUpdate: %v", err)
		}
		if len(repo.created) != 1 {
			t.Fatalf("replay created %d payments, want 1", len(repo.created))
		}
		if !repo.created[0].ExpirationDate.Equal(*firstExp) {
			t.Fatal("replay slid the expiration window")
		}
	})

	t.Run("non-XTR currency and foreign payloads are ignored", func(t *testing.T) {
		repo := &fakePaymentRepo{}
		uc := &telegramUsecase{paymentUsecase: NewPaymentUsecases(repo)}
		if err := uc.TakeUpdate(newUpdate("USD", "premium_999001_deadbeef", "chg-usd")); err != nil {
			t.Fatalf("USD TakeUpdate: %v", err)
		}
		if err := uc.TakeUpdate(newUpdate("XTR", "subscription_deadbeef", "chg-old")); err != nil {
			t.Fatalf("foreign payload TakeUpdate: %v", err)
		}
		if err := uc.TakeUpdate(newUpdate("XTR", "premium_999001_deadbeef", "")); err != nil {
			t.Fatalf("missing charge id TakeUpdate: %v", err)
		}
		if len(repo.created) != 0 {
			t.Fatalf("ignored updates still created payments: %+v", repo.created)
		}
	})
}

// TestEnsureWebhook covers boot-time webhook auto-registration against a fake
// Telegram API: getWebhookInfo is always consulted first, setWebhook fires
// only when the registered URL is unset or points elsewhere, the secret is
// forwarded as secret_token, and failures surface as errors.
func TestEnsureWebhook(t *testing.T) {
	const (
		token = "test-token"
		url   = "https://app.example.koyeb.app/api/telegram/webhook"
	)

	var (
		methods []string       // Telegram API methods hit, in order
		setBody map[string]any // last setWebhook request body
		infoURL string         // URL the fake reports as currently registered
		failGet bool           // make getWebhookInfo return an API error
	)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		method := r.URL.Path[strings.LastIndex(r.URL.Path, "/")+1:]
		methods = append(methods, method)
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		switch method {
		case "getWebhookInfo":
			if failGet {
				_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error_code": 400, "description": "boom"})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "result": map[string]any{"url": infoURL}})
		case "setWebhook":
			setBody = body
			_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "result": true})
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "description": "unexpected method " + method})
		}
	}))
	defer ts.Close()

	t.Setenv("TELEGRAM_BOT_TOKEN", token)
	prevBase := telegramAPIBase
	telegramAPIBase = ts.URL + "/bot"
	defer func() { telegramAPIBase = prevBase }()

	newUsecase := func() *telegramUsecase { return &telegramUsecase{bot: &tgbotapi.BotAPI{Token: token}} }

	t.Run("registers when no webhook is set", func(t *testing.T) {
		methods, setBody, infoURL = nil, nil, ""
		if err := newUsecase().EnsureWebhook(url, "s3cr3t"); err != nil {
			t.Fatalf("EnsureWebhook: %v", err)
		}
		if len(methods) != 2 || methods[0] != "getWebhookInfo" || methods[1] != "setWebhook" {
			t.Fatalf("calls = %v, want getWebhookInfo then setWebhook", methods)
		}
		if setBody["url"] != url {
			t.Fatalf("setWebhook url = %v, want %s", setBody["url"], url)
		}
		if setBody["secret_token"] != "s3cr3t" {
			t.Fatalf("setWebhook secret_token = %v, want s3cr3t", setBody["secret_token"])
		}
		allowed, _ := setBody["allowed_updates"].([]any)
		if len(allowed) != 2 || allowed[0] != "message" || allowed[1] != "callback_query" {
			t.Fatalf("allowed_updates = %v, want [message callback_query]", allowed)
		}
	})

	t.Run("skips setWebhook when already registered", func(t *testing.T) {
		methods, setBody, infoURL = nil, nil, url
		if err := newUsecase().EnsureWebhook(url, "s3cr3t"); err != nil {
			t.Fatalf("EnsureWebhook: %v", err)
		}
		if len(methods) != 1 || methods[0] != "getWebhookInfo" {
			t.Fatalf("calls = %v, want only getWebhookInfo", methods)
		}
	})

	t.Run("re-registers after URL moved and omits empty secret", func(t *testing.T) {
		methods, setBody, infoURL = nil, nil, "https://old.example.com/api/telegram/webhook"
		if err := newUsecase().EnsureWebhook(url, ""); err != nil {
			t.Fatalf("EnsureWebhook: %v", err)
		}
		if len(methods) != 2 || methods[1] != "setWebhook" {
			t.Fatalf("calls = %v, want getWebhookInfo then setWebhook", methods)
		}
		if setBody["url"] != url {
			t.Fatalf("setWebhook url = %v, want %s", setBody["url"], url)
		}
		if _, present := setBody["secret_token"]; present {
			t.Fatalf("empty secret must be omitted, got %v", setBody["secret_token"])
		}
	})

	t.Run("rejects non-https URL before any call", func(t *testing.T) {
		methods, setBody = nil, nil
		if err := newUsecase().EnsureWebhook("http://app.example/api/telegram/webhook", "s3cr3t"); err == nil {
			t.Fatal("expected http:// URL to be rejected")
		}
		if len(methods) != 0 {
			t.Fatalf("no Telegram calls expected, got %v", methods)
		}
	})

	t.Run("propagates Telegram API failure", func(t *testing.T) {
		methods, setBody, failGet = nil, nil, true
		defer func() { failGet = false }()
		if err := newUsecase().EnsureWebhook(url, "s3cr3t"); err == nil || !strings.Contains(err.Error(), "getWebhookInfo") {
			t.Fatalf("expected getWebhookInfo failure to surface, got %v", err)
		}
	})

	t.Run("errors when bot is not configured", func(t *testing.T) {
		if err := (&telegramUsecase{}).EnsureWebhook(url, "s3cr3t"); err == nil {
			t.Fatal("expected error when bot is nil")
		}
	})
}
