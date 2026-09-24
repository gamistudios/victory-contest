package http

import (
	"errors"
	"net/http"
	"strings"
	"victor-contest-go/internal/domain"
	"victor-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// AiAdminHandler is the admin-only CRUD surface for AI providers
// (/api/ai-admin/providers). Provider management belongs to the external
// admin panel, so every route here sits behind adminAuth. Responses use
// providerView and therefore can never carry api_key: the domain field is
// json:"-" AND the view struct simply has no key field, only a last-4 hint.
type AiAdminHandler struct {
	uc usecase.AiProviderUsecase
}

func NewAiAdminHandler(uc usecase.AiProviderUsecase) *AiAdminHandler {
	return &AiAdminHandler{uc: uc}
}

func (h *AiAdminHandler) RegisterRoutes(rg *gin.RouterGroup, adminAuth ...gin.HandlerFunc) {
	auth := rg.Group("", adminAuth...)
	auth.GET("/providers", h.List)
	auth.GET("/providers/:id", h.Get)
	auth.POST("/providers", h.Create)
	auth.PUT("/providers/:id", h.Update)
	auth.DELETE("/providers/:id", h.Delete)
	auth.POST("/providers/:id/test", h.Test)
}

// providerView is the only representation of a provider that leaves this
// handler. APIKeyHint exposes at most the last 4 characters, enough for an
// admin to recognize which key is stored without recovering it.
type providerView struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	BaseURL    string   `json:"base_url"`
	Protocol   string   `json:"protocol"`
	Models     []string `json:"models"`
	Enabled    bool     `json:"enabled"`
	CreatedAt  string   `json:"created_at"`
	UpdatedAt  string   `json:"updated_at"`
	APIKeyHint string   `json:"api_key_hint"`
	HasKey     bool     `json:"has_api_key"`
}

func toProviderView(p domain.AIProvider) providerView {
	return providerView{
		ID:         p.ID,
		Name:       p.Name,
		BaseURL:    p.BaseURL,
		Protocol:   p.Protocol,
		Models:     p.Models,
		Enabled:    p.Enabled,
		CreatedAt:  p.CreatedAt,
		UpdatedAt:  p.UpdatedAt,
		APIKeyHint: lastFourHint(p.APIKey),
		HasKey:     p.APIKey != "",
	}
}

func lastFourHint(key string) string {
	if len(key) < 8 {
		return ""
	}
	return "…" + key[len(key)-4:]
}

// aiProviderInput mirrors the domain row for POST/PUT bodies. Enabled is a
// pointer so an omitted field defaults to true on create (a provider nobody
// asks for explicitly is still meant to work) and keeps the stored value
// semantics on update handled in the usecase.
type aiProviderInput struct {
	Name     string   `json:"name"`
	BaseURL  string   `json:"base_url"`
	APIKey   string   `json:"api_key"`
	Protocol string   `json:"protocol"`
	Models   []string `json:"models"`
	Enabled  *bool    `json:"enabled"`
}

func (i aiProviderInput) toProvider(defaultEnabled bool) domain.AIProvider {
	enabled := defaultEnabled
	if i.Enabled != nil {
		enabled = *i.Enabled
	}
	return domain.AIProvider{
		Name:     strings.TrimSpace(i.Name),
		BaseURL:  strings.TrimSpace(i.BaseURL),
		APIKey:   strings.TrimSpace(i.APIKey),
		Protocol: i.Protocol,
		Models:   i.Models,
		Enabled:  enabled,
	}
}

func (h *AiAdminHandler) List(c *gin.Context) {
	providers, err := h.uc.ListProviders()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	views := make([]providerView, 0, len(providers))
	for _, p := range providers {
		views = append(views, toProviderView(p))
	}
	c.JSON(http.StatusOK, gin.H{"providers": views})
}

func (h *AiAdminHandler) Get(c *gin.Context) {
	p, err := h.uc.GetProviderByID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if p == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "provider not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"provider": toProviderView(*p)})
}

func (h *AiAdminHandler) Create(c *gin.Context) {
	var input aiProviderInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// Use-case validation (protocol enum, https-or-localhost base_url,
	// embedded-credential rejection, models/api_key required) maps to 400:
	// these are client-fixable input faults, not server errors.
	id, err := h.uc.CreateProvider(input.toProvider(true))
	if err != nil {
		status := http.StatusInternalServerError
		if usecase.IsProviderInputError(err) {
			status = http.StatusBadRequest
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id})
}

func (h *AiAdminHandler) Update(c *gin.Context) {
	var input aiProviderInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// PUT without api_key keeps the stored key (handled in the usecase);
	// PUT without enabled keeps the stored flag.
	p := input.toProvider(false)
	existing, err := h.uc.GetProviderByID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if existing == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "provider not found"})
		return
	}
	if input.Enabled == nil {
		p.Enabled = existing.Enabled
	}
	if err := h.uc.UpdateProvider(c.Param("id"), p); err != nil {
		switch {
		case errors.Is(err, usecase.ErrProviderNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		case usecase.IsProviderInputError(err):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success"})
}

func (h *AiAdminHandler) Delete(c *gin.Context) {
	if err := h.uc.DeleteProvider(c.Param("id")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success"})
}

// Test fires one tiny prompt at the stored provider through its protocol
// adapter and answers {ok, message}. The message is masked upstream in the
// usecase, so the API key can never ride out in an error.
func (h *AiAdminHandler) Test(c *gin.Context) {
	res, err := h.uc.TestProvider(c.Param("id"))
	if err != nil {
		if errors.Is(err, usecase.ErrProviderNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, res)
}
