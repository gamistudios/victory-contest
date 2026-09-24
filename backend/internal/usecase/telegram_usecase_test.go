package usecase

import (
	"errors"
	"strings"
	"testing"
	"time"

	"victor-contest-go/internal/domain"

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
// surface "not configured" if validation passed).
func TestCreatePremiumInvoiceLinkBindsUser(t *testing.T) {
	uc := &telegramUsecase{}
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
