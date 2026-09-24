package http

import (
	"net/http"
	"victor-contest-go/internal/domain"
	"victor-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// PaymentSettingsHandler exposes the global Telegram Stars switch: an admin
// 🔒 GET/PUT surface (/api/payment-admin/settings) and one unauthenticated
// read (/api/payment/settings) that reveals only the allow_stars flag so the
// student UI can decide whether to show the option.
type PaymentSettingsHandler struct {
	uc usecase.PaymentSettingsUsecase
}

func NewPaymentSettingsHandler(uc usecase.PaymentSettingsUsecase) *PaymentSettingsHandler {
	return &PaymentSettingsHandler{uc: uc}
}

// RegisterRoutes mounts the admin-only settings CRUD behind adminAuth and the
// single student-facing read of the switch. The admin group is a sibling path
// so it can share the /api prefix while using the same adminAuth cookie the
// ai-admin routes require.
func (h *PaymentSettingsHandler) RegisterRoutes(rg *gin.RouterGroup, adminAuth ...gin.HandlerFunc) {
	auth := rg.Group("/payment-admin", adminAuth...)
	auth.GET("/settings", h.AdminGetSettings)
	auth.PUT("/settings", h.AdminPutSettings)
	rg.GET("/payment/settings", h.PublicGetSettings)
}

// paymentSettingsAdminView is the full admin wire shape (flag + invoice price).
type paymentSettingsAdminView struct {
	AllowStars  bool `json:"allow_stars"`
	StarsAmount int  `json:"stars_amount"`
}

// paymentSettingsPublicView is the only payment setting students may read.
type paymentSettingsPublicView struct {
	AllowStars bool `json:"allow_stars"`
}

func (h *PaymentSettingsHandler) AdminGetSettings(c *gin.Context) {
	s, err := h.uc.GetSettings()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, paymentSettingsAdminView{AllowStars: s.AllowStars, StarsAmount: s.StarsAmount})
}

func (h *PaymentSettingsHandler) AdminPutSettings(c *gin.Context) {
	var input paymentSettingsAdminView
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.uc.SaveSettings(domain.PaymentSettings{AllowStars: input.AllowStars, StarsAmount: input.StarsAmount}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, input)
}

// PublicGetSettings reveals the allow_stars flag via the fail-open-to-false
// read: a settings-table error keeps Stars hidden rather than 500ing the
// student payment page.
func (h *PaymentSettingsHandler) PublicGetSettings(c *gin.Context) {
	c.JSON(http.StatusOK, paymentSettingsPublicView{AllowStars: h.uc.AllowStars()})
}
