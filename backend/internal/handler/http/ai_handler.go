package http

import (
	"net/http"
	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// aiPremiumRequiredMessage is the exact 403 body the /api/ai gate answers
// when the admin switch require_premium is on and the caller is not a
// premium student. The frontend special-cases this string (plus the 403
// status) to show an upgrade prompt instead of a generic failure, so it is
// part of the wire contract — change it together with aiService.ts.
const aiPremiumRequiredMessage = "AI features are available for premium students. Upgrade to start practicing."

// AiHandler serves the public student AI surface (/api/ai). Routes stay
// unauthenticated (anonymous students may practice), but every call passes
// the optional premium gate: an optional student session is resolved from
// the usual Bearer/cookie sources and, when the admin-defined global switch
// (usecase.AiSettingsUsecase) demands premium, only students with an active
// approved payment proceed. access == nil keeps the surface fully public
// (handler unit tests / stripped wiring).
type AiHandler struct {
	usecase   usecase.AiUsecase
	access    usecase.AiSettingsUsecase
	jwtSecret []byte
}

func NewAiHandler(uc usecase.AiUsecase, access usecase.AiSettingsUsecase, jwtSecret string) *AiHandler {
	return &AiHandler{usecase: uc, access: access, jwtSecret: []byte(jwtSecret)}
}

func (h *AiHandler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.POST("/practice", h.Practice)
	rg.POST("/getRecommendation", h.GetRecommendation)
	rg.POST("/explain", h.Explain)
	// The switch state is public (it is the gate itself, not AI work): the
	// student app reads it to decide whether to pre-lock the AI entry.
	rg.GET("/settings", h.GetSettings)
}

// gate reports whether the request may proceed. When require_premium is off
// (or unreadable — fail-open, see AiSettingsUsecase.RequirePremium) every
// request passes exactly as before. When it is on, a valid student session
// with premium status passes; anything else — anonymous, invalid or expired
// token, admin session (role ""), free student — gets the 403 upgrade
// answer and must not reach the (paid) upstream.
func (h *AiHandler) gate(c *gin.Context) bool {
	if h.access == nil || !h.access.RequirePremium() {
		return true
	}
	if tok := studentSessionToken(c); tok != "" {
		if claims, ok := parseJWTClaims(tok, h.jwtSecret); ok && claims.Role == StudentRole && h.access.IsPremiumStudent(claims.UserID) {
			return true
		}
	}
	c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": aiPremiumRequiredMessage})
	return false
}

func (h *AiHandler) Practice(c *gin.Context) {
	if !h.gate(c) {
		return
	}
	var setting domain.AiPracticeSetting
	if err := c.ShouldBindJSON(&setting); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	questions, err := h.usecase.PracticeWithAi(setting)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"questions": questions})
}

func (h *AiHandler) GetRecommendation(c *gin.Context) {
	if !h.gate(c) {
		return
	}
	var recommendationInput domain.RecommendationInput
	if err := c.ShouldBindJSON(&recommendationInput); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	recommendation, err := h.usecase.GenerateRecommendations(recommendationInput)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"recommendation": recommendation})
}

// Explain is the on-question AI tutor. It passes through the same premium
// gate as every other /api/ai call, then hands the full quiz context plus the
// focused question (and an optional follow-up) to the model, which is
// instructed to guide without revealing the answer. The reply is markdown.
func (h *AiHandler) Explain(c *gin.Context) {
	if !h.gate(c) {
		return
	}
	var req domain.AiChatExplainRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	reply, err := h.usecase.ChatExplain(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"reply": reply})
}

// GetSettings returns the AI feature switch state for the student app to read
// on load. It is intentionally NOT behind the premium gate — it is the gate,
// not AI work — and answers the fail-open value when the settings row is
// unreadable (mirrors RequirePremium).
func (h *AiHandler) GetSettings(c *gin.Context) {
	requirePremium := false
	if h.access != nil {
		if s, err := h.access.GetSettings(); err == nil {
			requirePremium = s.RequirePremium
		} else {
			// Fall back to the fail-open read used on the request path.
			requirePremium = h.access.RequirePremium()
		}
	}
	c.JSON(http.StatusOK, gin.H{"require_premium": requirePremium})
}
