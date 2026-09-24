package http

import (
	"net/http"
	"strings"
	"time"
	"victor-contest-go/internal/domain"
	"victor-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// studentTokenTTL is how long an issued student session stays valid.
const studentTokenTTL = 7 * 24 * time.Hour

// telegramAuthHandler implements the S2 login exchange: the client posts the
// raw Telegram WebApp initData string, the server validates the HMAC signature
// against the bot token and answers with a student JWT that studentAuth
// accepts. Before this, every student endpoint trusted a client-declared
// Telegram id (README §9 #6 remainder).
type telegramAuthHandler struct {
	jwtSecret []byte
	botToken  string // TELEGRAM_BOT_TOKEN; empty disables real initData auth
	// allowDevAuth mirrors ALLOW_DEV_AUTH. See DevAuth for the (loud) caveat.
	allowDevAuth bool
}

func newTelegramAuthHandler(jwtSecret, botToken string, allowDevAuth bool) *telegramAuthHandler {
	return &telegramAuthHandler{
		jwtSecret:    []byte(jwtSecret),
		botToken:     botToken,
		allowDevAuth: allowDevAuth,
	}
}

func (h *telegramAuthHandler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.POST("/auth", h.Auth)
	rg.POST("/auth/dev", h.DevAuth)
}

type telegramAuthRequest struct {
	InitData string `json:"initData"`
}

// Auth serves POST /api/telegram/auth.
func (h *telegramAuthHandler) Auth(c *gin.Context) {
	if h.botToken == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "telegram auth not configured"})
		return
	}
	var req telegramAuthRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	telegramID, _, err := usecase.ValidateTelegramInitData(req.InitData, h.botToken, time.Now())
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid initData: " + err.Error()})
		return
	}
	h.issueStudentToken(c, telegramID)
}

type telegramDevAuthRequest struct {
	UserID string `json:"user_id"`
}

// DevAuth serves POST /api/telegram/auth/dev: the same student JWT as Auth but
// for any client-declared user_id, with NO Telegram signature check.
//
// ⚠️ DANGER: this endpoint forges sessions and is therefore wired ONLY when
// the server was explicitly started with ALLOW_DEV_AUTH=true (local dev
// against the mock WebApp, where no valid bot token exists). In production
// ALLOW_DEV_AUTH must stay unset, in which case this answers 404 and behaves
// like any other unknown route. Never deploy with it enabled.
func (h *telegramAuthHandler) DevAuth(c *gin.Context) {
	if !h.allowDevAuth {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req telegramDevAuthRequest
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.UserID) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user_id is required"})
		return
	}
	h.issueStudentToken(c, strings.TrimSpace(req.UserID))
}

func (h *telegramAuthHandler) issueStudentToken(c *gin.Context, telegramID string) {
	now := time.Now()
	claims := domain.CustomClaims{
		UserID: telegramID,
		Role:   StudentRole,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(studentTokenTTL)),
		},
	}
	tokenString, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(h.jwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": tokenString, "user_id": telegramID})
}
