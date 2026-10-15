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
	rg.POST("/remove", h.RemoveLocation)
}

// canonicalRegions is the list the admin page is allowed to hold: one entry per
// city id. Handing back the raw stored list would let the page adopt a legacy
// duplicate and then fail its own save, since a list carrying one id twice is not
// a valid write.
func (h *CatalogHandler) canonicalRegions() []domain.Region {
	l, _ := usecase.CanonicalLocations(h.uc.Locations())
	return l.Regions
}

// RemoveLocation deletes a region or city from the list. Its students are moved
// onto another entry, or unlinked back to free text when no target is given.
func (h *CatalogHandler) RemoveLocation(c *gin.Context) {
	var in usecase.RemoveLocationInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	res, err := h.uc.RemoveLocation(in)
	if err != nil {
		if errors.Is(err, usecase.ErrInvalidLocation) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		log.Printf("locations remove: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"moved":    res.Moved,
		"unlinked": res.Unlinked,
		"failed":   res.Failed,
		"dropped":  res.Dropped,
		"target":   res.Target,
		"regions":  h.canonicalRegions(),
	})
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
	n, failed, tgt, err := h.uc.PromoteLocation(in)
	if err != nil {
		if errors.Is(err, usecase.ErrInvalidLocation) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		log.Printf("locations promote: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"updated": n, "failed": failed, "target": tgt, "regions": h.canonicalRegions()})
}

// GetLocations hands the admin the canonical list: one entry per city id. A
// legacy duplicate would otherwise show up as two rows they can edit and come
// back on save, because a list carrying one id twice is not a valid save. The
// per-entry student counts ride along so the page can say what a removal does
// before the admin clicks it.
func (h *CatalogHandler) GetLocations(c *gin.Context) {
	l, _ := usecase.CanonicalLocations(h.uc.Locations())
	counts, err := h.uc.LocationStudentCounts()
	if err != nil {
		log.Printf("locations counts: %v", err)
		counts = nil
	}
	c.JSON(http.StatusOK, gin.H{"regions": l.Regions, "counts": counts})
}

func (h *CatalogHandler) PutLocations(c *gin.Context) {
	var l domain.Locations
	if err := c.ShouldBindJSON(&l); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.uc.GuardLocationDrops(l); err != nil {
		if errors.Is(err, usecase.ErrInvalidLocation) {
			// The message names the entries and how many students sit on them.
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		log.Printf("locations save: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
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
