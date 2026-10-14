package http

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// CatalogHandler serves the public catalog (plan §5.1): programs, streams,
// subjects, chapters and the location lists, so both frontends fill EVERY
// dropdown from one place (fixes D10). Public and cacheable (ETag).
type CatalogHandler struct {
	uc *usecase.AcademyUsecase
}

func NewCatalogHandler(uc *usecase.AcademyUsecase) *CatalogHandler {
	return &CatalogHandler{uc: uc}
}

func (h *CatalogHandler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.GET("", h.Get)
	rg.GET("/", h.Get)
}

func (h *CatalogHandler) Get(c *gin.Context) {
	view, err := h.uc.Catalog()
	if err != nil {
		log.Printf("catalog: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}
	body, err := json.Marshal(view)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}
	sum := sha256.Sum256(body)
	etag := `"` + hex.EncodeToString(sum[:8]) + `"`
	c.Header("ETag", etag)
	c.Header("Cache-Control", "public, max-age=60, must-revalidate")
	if c.GetHeader("If-None-Match") == etag {
		c.Status(http.StatusNotModified)
		return
	}
	c.Data(http.StatusOK, "application/json; charset=utf-8", body)
}

// RegisterAdminRoutes: admin Locations management (plan §5.1).
func (h *CatalogHandler) RegisterAdminRoutes(rg *gin.RouterGroup) {
	rg.GET("", h.GetLocations)
	rg.PUT("", h.PutLocations)
	rg.GET("/free-text", h.FreeText)
	rg.POST("/promote", h.Promote)
}

// FreeText lists the distinct "Other" region/city entries students typed.
func (h *CatalogHandler) FreeText(c *gin.Context) {
	out, err := h.uc.FreeTextLocations()
	if err != nil {
		log.Printf("locations free-text: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": out})
}

// Promote maps one free-text group onto a stored region/city and relinks the students.
func (h *CatalogHandler) Promote(c *gin.Context) {
	var in usecase.PromoteLocationInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	n, err := h.uc.PromoteLocation(in)
	if err != nil {
		if errors.Is(err, usecase.ErrInvalidLocation) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "choose an existing region or give a new region name, and a city name"})
			return
		}
		log.Printf("locations promote: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"updated": n, "regions": h.uc.Locations().Regions})
}

func (h *CatalogHandler) GetLocations(c *gin.Context) { c.JSON(http.StatusOK, h.uc.Locations()) }

func (h *CatalogHandler) PutLocations(c *gin.Context) {
	var l domain.Locations
	if err := c.ShouldBindJSON(&l); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.uc.SaveLocations(l); err != nil {
		if errors.Is(err, usecase.ErrInvalidLocation) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "every region and city needs a unique id and a name"})
			return
		}
		log.Printf("locations: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}
	c.JSON(http.StatusOK, h.uc.Locations())
}
