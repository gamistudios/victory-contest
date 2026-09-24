package http

import (
	"crypto/subtle"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"victor-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

type telegramHandler struct {
	usecase       usecase.TelegramUsecase
	webhookSecret string // TELEGRAM_WEBHOOK_SECRET; empty = verification disabled
	// studentAuthMw is wired by NewRouter; when set, POST /invoice-link
	// requires a student token whose Telegram id equals the body's user_id.
	studentAuthMw gin.HandlerFunc
}

func (t *telegramHandler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.POST("/webhook", t.Updater)
	rg.POST("/invoice-link", withStudentAuth(t.studentAuthMw, t.InvoiceLink)...)
	rg.POST("/prepared-inline-message", t.PreparedInlineMessage)
}

// InvoiceLink creates a Telegram Stars invoice server-side (bot token stays
// secret) with the buyer's Telegram id bound into the invoice payload, so the
// successful_payment webhook can attribute the charge without trusting any
// later client claim.
func (t *telegramHandler) InvoiceLink(c *gin.Context) {
	var req struct {
		UserID string `json:"user_id"`
	}
	_ = c.ShouldBindJSON(&req) // absent/legacy body tolerated; token wins below
	userID := strings.TrimSpace(req.UserID)
	if tokenID := c.GetString(StudentUserIDContextKey); tokenID != "" {
		if !requireMatchingStudent(c, userID) {
			c.JSON(http.StatusForbidden, gin.H{"error": "user_id does not match the authenticated student"})
			return
		}
		userID = tokenID
	}
	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id is required to bind the invoice to a buyer"})
		return
	}
	link, err := t.usecase.CreatePremiumInvoiceLink(userID)
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
