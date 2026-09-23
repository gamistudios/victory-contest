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
	"strings"
	"time"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/google/uuid"
)

type TelegramUsecase interface {
	HandleStartCommand(chatId, userId int64) error
	TakeUpdate(update tgbotapi.Update) error
	CreatePremiumInvoiceLink() (string, error)
	SavePreparedInlineMessage(userID int64, result json.RawMessage) (json.RawMessage, error)
}
type telegramUsecase struct {
	bot *tgbotapi.BotAPI
}

// StartCommand implements TelegramUsecase.
func (t *telegramUsecase) HandleStartCommand(chatId, userId int64) error {
	if t.bot == nil {
		return errors.New("telegram bot is not configured")
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
func (t *telegramUsecase) TakeUpdate(update tgbotapi.Update) error {
	message := update.Message
	chatID := message.Chat.ID
	userID := message.From.ID
	text := message.Text

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

	// _, err := t.bot.Send(photoMsg)
	// if err != nil {
	// 	return err
	// }
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

// CreatePremiumInvoiceLink creates a Telegram Stars subscription invoice
// server-side so the bot token never reaches the client.
func (t *telegramUsecase) CreatePremiumInvoiceLink() (string, error) {
	result, err := t.callTelegram("createInvoiceLink", map[string]any{
		"title":       "Premium Plan",
		"description": "Victory Learning premium plan",
		"payload":     "subscription_" + strings.ReplaceAll(uuid.NewString(), "-", ""),
		"currency":    "XTR",
		"prices":      []map[string]any{{"label": "Victory Premium", "amount": 50}},
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

func NewTelegramUsecase(bot *tgbotapi.BotAPI) TelegramUsecase {
	return &telegramUsecase{bot: bot}
}
