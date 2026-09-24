package http

import (
	"net/http"
	"strconv"
	"victory-contest-go/internal/repository"

	"github.com/gin-gonic/gin"
)

type ImageHandler struct {
    repo *repository.ImageRepository
}

func NewImageHandler(repo *repository.ImageRepository) *ImageHandler {
    return &ImageHandler{repo: repo}
}

func (h *ImageHandler) RegisterRoutes(rg *gin.RouterGroup, adminAuth ...gin.HandlerFunc) {
	// Cloudinary upload/list/delete are admin content tooling; students only
	// ever read the resulting image URLs.
	auth := rg.Group("", adminAuth...)
	auth.POST("/upload", h.Upload)
	auth.GET("/list", h.List)
	auth.DELETE("/delete", h.Delete)
}

func (h *ImageHandler) Upload(c *gin.Context) {
    folder := c.DefaultPostForm("folder", "articles")
    fileHeader, err := c.FormFile("file")
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
        return
    }
    // Size/type guard before the upload (README §9 #50).
    if err := validateImageUpload(fileHeader); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    file, err := fileHeader.Open()
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to open file"})
        return
    }
    defer file.Close()

    url, err := h.repo.UploadImage(file, folder)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }
    c.JSON(http.StatusOK, gin.H{"url": url})
}

func (h *ImageHandler) List(c *gin.Context) {
    folder := c.DefaultQuery("folder", "articles")
    maxStr := c.DefaultQuery("max", "100")
    max, _ := strconv.Atoi(maxStr)
    urls, err := h.repo.ListImages(folder, max)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }
    c.JSON(http.StatusOK, gin.H{"images": urls})
}

func (h *ImageHandler) Delete(c *gin.Context) {
    id := c.Query("id")
    if id == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "id is required (public id or url)"})
        return
    }
    if err := h.repo.DeleteImage(id); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }
    c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}


