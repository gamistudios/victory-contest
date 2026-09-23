package http

import (
	"crypto/subtle"
	"encoding/json"
	"log"
	"net/http"
	"victor-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

type telegramHandler struct {
	usecase        usecase.TelegramUsecase
	webhookSecret  string // TELEGRAM_WEBHOOK_SECRET; empty = verification disabled
}

func (t *telegramHandler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.POST("/webhook", t.Updater)
	rg.POST("/invoice-link", t.InvoiceLink)
	rg.POST("/prepared-inline-message", t.PreparedInlineMessage)
}

// InvoiceLink creates a Telegram Stars invoice server-side (bot token stays secret).
func (t *telegramHandler) InvoiceLink(c *gin.Context) {
	link, err := t.usecase.CreatePremiumInvoiceLink()
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"result": link})
}

type preparedInlineMessageRequest struct {
	UserID int64           `json:"user_id" binding:"required"`
	Result json.RawMessage `json:"result" binding:"required"`
}

// PreparedInlineMessage stores an inline query result and returns its id.
func (t *telegramHandler) PreparedInlineMessage(c *gin.Context) {
	var req preparedInlineMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := t.usecase.SavePreparedInlineMessage(req.UserID, req.Result)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"result": json.RawMessage(result)})
}

// Updater implements TelegramHandler.
func (t *telegramHandler) Updater(c *gin.Context) {
	// When TELEGRAM_WEBHOOK_SECRET is configured, Telegram echoes it in the
	// X-Telegram-Bot-Api-Secret-Token header on every update; without it the
	// endpoint accepts anyone who knows the URL (issue #9).
	if t.webhookSecret != "" {
		got := c.GetHeader("X-Telegram-Bot-Api-Secret-Token")
		if subtle.ConstantTimeCompare([]byte(got), []byte(t.webhookSecret)) != 1 {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
	}
	var update tgbotapi.Update
	if err := c.ShouldBindJSON(&update); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	err := t.usecase.TakeUpdate(update)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func NewTelegramHandler(usecase usecase.TelegramUsecase, webhookSecret string) *telegramHandler {
	if webhookSecret == "" {
		log.Println("TELEGRAM_WEBHOOK_SECRET not set — webhook updates are accepted without secret-token verification")
	}
	return &telegramHandler{usecase: usecase, webhookSecret: webhookSecret}
}
