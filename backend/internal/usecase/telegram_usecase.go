package usecase

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/google/uuid"
	"victory-contest-go/internal/domain"
)

type TelegramUsecase interface {
	HandleStartCommand(chatId, userId int64) error
	TakeUpdate(update tgbotapi.Update) error
	CreatePremiumInvoiceLink(userID string) (string, error)
	SavePreparedInlineMessage(userID int64, result json.RawMessage) (json.RawMessage, error)
}
type telegramUsecase struct {
	bot            *tgbotapi.BotAPI
	studentRepo    StudentRepository
	paymentUsecase PaymentUsecase
	// settings gates the Stars invoice surface and supplies its XTR price; nil
	// (stripped wiring / tests) means Stars is disabled, the safe default.
	settings PaymentSettingsUsecase
}

// StartCommand implements TelegramUsecase.
//
// userId is the Telegram user id of the student who sent /start. It is used to
// look up (and, on first contact, register) the corresponding student profile,
// so the contest WebApp opened from the welcome message has a row to attach to.
func (t *telegramUsecase) HandleStartCommand(chatId, userId int64) error {
	if userId != 0 && t.studentRepo != nil {
		telegramID := strconv.FormatInt(userId, 10)
		student, err := t.studentRepo.GetStudentByTelegramID(telegramID)
		if err != nil {
			return fmt.Errorf("lookup student %s: %w", telegramID, err)
		}
		if student == nil {
			student = &domain.Student{TelegramID: telegramID}
			if err := t.studentRepo.AddStudent(*student); err != nil {
				return fmt.Errorf("register student %s: %w", telegramID, err)
			}
			log.Printf("telegram: registered new student %s for /start", telegramID)
		} else {
			log.Printf("telegram: found existing student %s (%s) for /start", student.ID, telegramID)
		}
	}

	if t.bot == nil {
		log.Printf("telegram bot is not configured; skipping welcome message for chat %d", chatId)
		return nil
	}
	photoUrl := "https://firebasestorage.googleapis.com/v0/b/rent-ffb49.appspot.com/o/photos%2Fvictory-contest-log.png?alt=media&token=477e8229-07ad-4447-9ffa-3e16835b5d2a"
	message := "<b>Welcome! 👋 </b>\nPress the button below and take one step to the journey"
	keyboard := tgbotapi.NewInlineKeyboardMarkup(
		tgbotapi.NewInlineKeyboardRow(
			tgbotapi.NewInlineKeyboardButtonWebApp("Open Contest", tgbotapi.WebAppInfo{URL: "https://victory-contest.vercel.app"}),
		),
	)
	err := t.sendMessage(chatId, message, photoUrl, keyboard)
	if err != nil {
		return err
	}

	return nil
}

// TakeUpdate implements TelegramUsecase.
//
// Non-message updates (callback_query, edited_message, inline_query, ...) are
// acknowledged and ignored; only plain messages are handled. Nil guards on
// Message/Chat/From prevent the nil-pointer panic from #17. A message
// carrying successful_payment is the server-side source of truth for a
// Telegram Stars purchase (README §9 / S4) and is handled before the
// chat/text guards below.
func (t *telegramUsecase) TakeUpdate(update tgbotapi.Update) error {
	if update.Message == nil {
		log.Printf("telegram: ignoring non-message update %d", update.UpdateID)
		return nil
	}
	if sp := update.Message.SuccessfulPayment; sp != nil {
		return t.handleSuccessfulPayment(sp, update.Message.From)
	}
	if update.Message.Chat == nil {
		log.Printf("telegram: ignoring message without chat in update %d", update.UpdateID)
		return nil
	}
	chatID := update.Message.Chat.ID
	userID := int64(0)
	if update.Message.From != nil {
		userID = update.Message.From.ID
	}
	text := update.Message.Text

	if text == "/start" {
		err := t.HandleStartCommand(chatID, userID)
		if err != nil {
			return err
		}
		return nil
	}
	return nil
}
func (t *telegramUsecase) sendMessage(chatID int64, text string, photo string, keyboard tgbotapi.InlineKeyboardMarkup) error {
	photoMsg := tgbotapi.NewPhoto(chatID, tgbotapi.FileURL(photo))
	photoMsg.Caption = text
	photoMsg.ParseMode = "HTML"
	photoMsg.ReplyMarkup = keyboard

	if _, err := t.bot.Send(photoMsg); err != nil {
		log.Printf("Error sending photo: %v", err)
	}

	return nil
}

func (t *telegramUsecase) callTelegram(method string, payload map[string]any) (json.RawMessage, error) {
	if t.bot == nil {
		return nil, errors.New("telegram bot is not configured")
	}
	token := os.Getenv("TELEGRAM_BOT_TOKEN")
	if token == "" {
		return nil, errors.New("telegram bot is not configured")
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post("https://api.telegram.org/bot"+token+"/"+method, "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var out struct {
		OK          bool            `json:"ok"`
		Result      json.RawMessage `json:"result"`
		Description string          `json:"description"`
		ErrorCode   int             `json:"error_code"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("malformed telegram response: %w", err)
	}
	if !out.OK {
		return nil, fmt.Errorf("telegram API error %d: %s", out.ErrorCode, out.Description)
	}
	return out.Result, nil
}

// premiumPayloadPrefix marks an invoice payload as a premium purchase bound
// to a Telegram user id: "premium_<userID>_<random>". The payload survives
// the round trip through Telegram, so the webhook's successful_payment update
// can attribute the charge to the right student without any client claim.
const premiumPayloadPrefix = "premium_"

// buildPremiumPayload returns the invoice payload for the given Telegram user
// id, or an error when the id is not a plain numeric Telegram id.
func buildPremiumPayload(userID string) (string, error) {
	if userID == "" || strings.ContainsFunc(userID, func(r rune) bool { return r < '0' || r > '9' }) {
		return "", errors.New("telegram user id must be numeric")
	}
	return premiumPayloadPrefix + userID + "_" + strings.ReplaceAll(uuid.NewString(), "-", ""), nil
}

// parsePremiumPayload maps an invoice payload back to the bound Telegram user
// id. The random suffix must be present so hand-crafted short payloads from
// other sources are rejected.
func parsePremiumPayload(payload string) (string, bool) {
	rest, ok := strings.CutPrefix(payload, premiumPayloadPrefix)
	if !ok {
		return "", false
	}
	userID, random, ok := strings.Cut(rest, "_")
	if !ok || userID == "" || random == "" {
		return "", false
	}
	if strings.ContainsFunc(userID, func(r rune) bool { return r < '0' || r > '9' }) {
		return "", false
	}
	return userID, true
}

// handleSuccessfulPayment records a Telegram Stars purchase confirmed by
// Telegram. Only XTR (Stars) invoices created by CreatePremiumInvoiceLink are
// honored; the charge id doubles as the payment id, so a replayed webhook
// update resolves to the same row instead of creating a duplicate or
// extending the premium window twice.
func (t *telegramUsecase) handleSuccessfulPayment(sp *tgbotapi.SuccessfulPayment, from *tgbotapi.User) error {
	if sp.Currency != "XTR" {
		log.Printf("telegram: ignoring successful payment %s with currency %s (expected XTR)", sp.TelegramPaymentChargeID, sp.Currency)
		return nil
	}
	userID, ok := parsePremiumPayload(sp.InvoicePayload)
	if !ok {
		log.Printf("telegram: ignoring successful payment %s with unrecognized invoice payload %q", sp.TelegramPaymentChargeID, sp.InvoicePayload)
		return nil
	}
	if sp.TelegramPaymentChargeID == "" {
		log.Printf("telegram: ignoring successful payment for user %s without a charge id", userID)
		return nil
	}
	if t.paymentUsecase == nil {
		log.Printf("telegram: payment usecase not wired; dropping successful payment %s", sp.TelegramPaymentChargeID)
		return nil
	}
	fullName := ""
	if from != nil {
		fullName = strings.TrimSpace(from.FirstName + " " + from.LastName)
	}
	if err := t.paymentUsecase.ConfirmTelegramStarsPayment("tgpay_"+sp.TelegramPaymentChargeID, userID, fullName); err != nil {
		return fmt.Errorf("record telegram stars payment %s: %w", sp.TelegramPaymentChargeID, err)
	}
	log.Printf("telegram: recorded stars payment %s as approved for user %s", sp.TelegramPaymentChargeID, userID)
	return nil
}

// CreatePremiumInvoiceLink creates a Telegram Stars subscription invoice
// server-side so the bot token never reaches the client. userID (the buyer's
// Telegram id) is embedded in the invoice payload so the webhook can bind the
// eventual successful_payment update back to them.
func (t *telegramUsecase) CreatePremiumInvoiceLink(userID string) (string, error) {
	if t.settings == nil || !t.settings.AllowStars() {
		return "", errors.New("telegram stars payments are disabled")
	}
	payload, err := buildPremiumPayload(userID)
	if err != nil {
		return "", err
	}
	result, err := t.callTelegram("createInvoiceLink", map[string]any{
		"title":       "Premium Plan",
		"description": "Victory Learning premium plan",
		"payload":     payload,
		"currency":    "XTR",
		"prices":      []map[string]any{{"label": "Victory Premium", "amount": t.settings.StarsAmount()}},
	})
	if err != nil {
		return "", err
	}
	var link string
	if err := json.Unmarshal(result, &link); err != nil {
		return "", fmt.Errorf("telegram did not return an invoice URL: %w", err)
	}
	return link, nil
}

// SavePreparedInlineMessage stores an inline query result for the given user
// and returns the prepared message id.
func (t *telegramUsecase) SavePreparedInlineMessage(userID int64, result json.RawMessage) (json.RawMessage, error) {
	var parsed any
	if err := json.Unmarshal(result, &parsed); err != nil {
		return nil, fmt.Errorf("invalid inline query result: %w", err)
	}
	return t.callTelegram("savePreparedInlineMessage", map[string]any{
		"user_id":             userID,
		"result":              parsed,
		"allow_user_chats":    true,
		"allow_bot_chats":     true,
		"allow_group_chats":   true,
		"allow_channel_chats": true,
	})
}

func NewTelegramUsecase(bot *tgbotapi.BotAPI, studentRepo StudentRepository, paymentUsecase PaymentUsecase, settings ...PaymentSettingsUsecase) TelegramUsecase {
	uc := &telegramUsecase{bot: bot, studentRepo: studentRepo, paymentUsecase: paymentUsecase}
	if len(settings) > 0 {
		uc.settings = settings[0]
	}
	return uc
}
