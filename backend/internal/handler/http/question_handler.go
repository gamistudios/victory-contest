package http

import (
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/repository"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

type QuestionHandler struct {
	usecase   usecase.QuestionUsecase
	imageRepo *repository.ImageRepository
	// ai, when wired, powers the AI document-parse mode; nil disables it
	// (mode=text still works).
	ai usecase.AiUsecase
	// parseJobs runs bulk-question parses in the background (edge proxies
	// time out long requests); owned by the handler, one per process.
	parseJobs *usecase.ParseJobManager
}

func NewQuestionHandler(u usecase.QuestionUsecase, imgRepo *repository.ImageRepository, ai usecase.AiUsecase) *QuestionHandler {
	return &QuestionHandler{usecase: u, imageRepo: imgRepo, ai: ai, parseJobs: usecase.NewParseJobManager()}
}

func (h *QuestionHandler) RegisterRoutes(rg *gin.RouterGroup, adminAuth ...gin.HandlerFunc) {
	// Question rows carry the correct answers — the student app never reads
	// /question directly (exam content arrives hydrated on the contest), so
	// the whole surface is admin-only.
	auth := rg.Group("", adminAuth...)
	auth.POST("/add", h.AddQuestion)
	auth.POST("/multiple-add", h.AddMultipleQuestions)
	auth.POST("/multiple-delete", h.DeleteMultipleQuestions)
	auth.POST("/parse-document", h.ParseDocument)
	auth.GET("/parse-document/:jobId", h.ParseDocumentStatus)
	auth.PATCH("/:id", h.UpdateQuestion)
	auth.DELETE("/delete/:id", h.DeleteQuestion)
	auth.GET("/", h.GetAllQuestions)
	auth.GET("/:id", h.GetQuestionByID)
}

// maxDocumentUploadSize caps the parse-document upload (question-bank files
// are a few MB; this is generous headroom).
const maxDocumentUploadSize = 25 << 20 // 25 MB

// ParseDocument starts an asynchronous bulk-question parse of an uploaded
// question bank (.pdf/.docx/.txt). Edge proxies cut idle requests at ~30s
// while an exam-sized AI parse runs 30-90s, so the request validates the
// upload, kicks off a background job and immediately answers 202 with a
// job id — the panel polls GET /parse-document/:jobId until done. mode=form
// field picks the strategy: "ai" (default) sends the extracted per-page text
// + embedded images to the configured AI provider, which returns questions
// in the backend format with answers tagged; "text" runs the deterministic
// offline line parser. Nothing is persisted — the panel reviews the job
// result and submits via /multiple-add.
func (h *QuestionHandler) ParseDocument(c *gin.Context) {
	mode := strings.ToLower(c.DefaultPostForm("mode", "ai"))
	if mode != "text" && h.ai == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "AI parsing is not configured on this deployment — no AI provider is available. Retry with mode=text."})
		return
	}
	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "multipart field 'file' with a .pdf, .docx or .txt question bank is required"})
		return
	}
	if fileHeader.Size > maxDocumentUploadSize {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "file too large — the limit is 25 MB"})
		return
	}
	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read the uploaded file"})
		return
	}
	defer file.Close()
	content, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read the uploaded file"})
		return
	}

	// Extraction runs synchronously: it is fast and lets unreadable files
	// fail with an immediate 400 instead of a job that errors later.
	pages, err := usecase.ExtractDocumentPages(fileHeader.Filename, content)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// Images are best-effort: an extraction failure must not block parsing.
	images, err := usecase.ExtractDocumentImages(fileHeader.Filename, content)
	if err != nil {
		log.Printf("parse-document: image extraction failed (continuing without): %v", err)
		images = nil
	}

	jobID, err := h.parseJobs.StartAsync(mode, fileHeader.Filename, pages, images, h.ai)
	if err != nil {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"job_id": jobID, "status": usecase.ParseJobProcessing})
}

// ParseDocumentStatus answers a parse-job poll: processing, done (with the
// questions and extracted images) or error (with the reason).
func (h *QuestionHandler) ParseDocumentStatus(c *gin.Context) {
	status, ok := h.parseJobs.Get(c.Param("jobId"))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "unknown parse job — it may have expired or the server restarted; upload the file again"})
		return
	}
	code := http.StatusOK
	if status.Status == usecase.ParseJobProcessing {
		code = http.StatusAccepted
	}
	c.JSON(code, status)
}

func (h *QuestionHandler) AddQuestion(c *gin.Context) {
	var question domain.Question
	var err error

	// 1. Parse all form fields
	question.QuestionText = c.PostForm("question_text")
	question.Explanation = c.PostForm("explanation")
	question.Subject = c.PostForm("subject")
	question.Grade = c.PostForm("grade")
	question.Chapter = c.PostForm("chapter")
	question.MultipleChoice = c.PostFormArray("multiple_choice")
	answerStr := c.PostForm("answer")
	question.Answer, err = strconv.Atoi(answerStr)

	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid 'answer' format. Must be an integer."})
		return
	}

	// Range/shape check before any upload so a bad question never spends a
	// Cloudinary slot (README §9 #50).
	if err := usecase.ValidateQuestion(question); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	fileHeader, err := c.FormFile("question_image")
	if err != nil && err != http.ErrMissingFile {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to get image from form"})
		return
	}

	if fileHeader != nil {
		if err := validateImageUpload(fileHeader); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		file, err := fileHeader.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to open uploaded file"})
			return
		}
		defer file.Close()

		imgURL, err := h.imageRepo.UploadImage(file, "questions")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		question.QuestionImg = imgURL
	}

	// Handle explanation image if present
	explanationFileHeader, err := c.FormFile("explanation_image")
	if err != nil && err != http.ErrMissingFile {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to get explanation image from form"})
		return
	}

	if explanationFileHeader != nil {
		if err := validateImageUpload(explanationFileHeader); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		file, err := explanationFileHeader.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to open explanation image file"})
			return
		}
		defer file.Close()

		imgURL, err := h.imageRepo.UploadImage(file, "questions")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		question.ExplanationImg = imgURL
	}

	id, err := h.usecase.AddQuestion(question)
	if err != nil {
		if errors.Is(err, usecase.ErrInvalidQuestion) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"id": id, "message": "Question added successfully"})
}
func (h *QuestionHandler) AddMultipleQuestions(c *gin.Context) {
	var questions domain.MultipleQuestionRequest
	if err := c.ShouldBindJSON(&questions); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"err": err.Error()})
		return
	}
	if err := h.usecase.AddMultipleQuestions(questions.Questions); err != nil {
		if errors.Is(err, usecase.ErrInvalidQuestion) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Questions added successfully"})
}

func (h *QuestionHandler) UpdateQuestion(c *gin.Context) {
	id := c.Param("id")

	var patch domain.QuestionPatch

	// Check if the request is multipart/form-data (has files) or JSON
	contentType := c.GetHeader("Content-Type")

	if strings.Contains(contentType, "multipart/form-data") {
		// Presence-aware form binding: an omitted field must NOT clear the
		// stored value (the usecase merges the patch over the stored row).
		setForm := func(key string, dst **string) {
			if v, ok := c.GetPostForm(key); ok {
				p := v
				*dst = &p
			}
		}
		setForm("question_text", &patch.QuestionText)
		setForm("explanation", &patch.Explanation)
		setForm("subject", &patch.Subject)
		setForm("grade", &patch.Grade)
		setForm("chapter", &patch.Chapter)
		if _, ok := c.GetPostForm("multiple_choice"); ok {
			mc := c.PostFormArray("multiple_choice")
			patch.MultipleChoice = &mc
		}
		if answerStr, ok := c.GetPostForm("answer"); ok && answerStr != "" {
			answer, err := strconv.Atoi(answerStr)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid 'answer' format. Must be an integer."})
				return
			}
			patch.Answer = &answer
		}

		upload := func(field string) (string, error) {
			fileHeader, err := c.FormFile(field)
			if err != nil {
				return "", nil // no file under this key: field not provided
			}
			if err := validateImageUpload(fileHeader); err != nil {
				return "", err
			}
			file, err := fileHeader.Open()
			if err != nil {
				return "", err
			}
			defer file.Close()
			return h.imageRepo.UploadImage(file, "questions")
		}
		if url, err := upload("question_image"); err != nil {
			c.JSON(uploadStatus(err), gin.H{"error": err.Error()})
			return
		} else if url != "" {
			patch.QuestionImg = &url
		}
		if url, err := upload("explanation_image"); err != nil {
			c.JSON(uploadStatus(err), gin.H{"error": err.Error()})
			return
		} else if url != "" {
			patch.ExplanationImg = &url
		}
	} else {
		// JSON: pointer fields make "provided" vs "omitted" explicit.
		if err := c.ShouldBindJSON(&patch); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	err := h.usecase.UpdateQuestion(id, patch)
	if err != nil {
		if errors.Is(err, usecase.ErrQuestionNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		if errors.Is(err, usecase.ErrInvalidQuestion) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		log.Printf("UpdateQuestion(id=%s) failed: %v", id, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success"})
}

func (h *QuestionHandler) DeleteQuestion(c *gin.Context) {
	id := c.Param("id")
	err := h.usecase.DeleteQuestion(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success"})
}

// maxBulkDeleteIDs caps the number of ids accepted by the bulk-delete endpoint.
const maxBulkDeleteIDs = 500

type bulkDeleteQuestionsRequest struct {
	IDs []string `json:"ids"`
}

// DeleteMultipleQuestions handles POST /api/question/multiple-delete with body
// {"ids": ["..."]}. It returns 200 with {"deleted": [...], "failed": [{"id","error"}]}.
func (h *QuestionHandler) DeleteMultipleQuestions(c *gin.Context) {
	var req bulkDeleteQuestionsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body: expected JSON {\"ids\": [\"...\"]} with string ids"})
		return
	}
	if len(req.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "'ids' must be a non-empty array of question ids"})
		return
	}
	if len(req.IDs) > maxBulkDeleteIDs {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Too many ids: maximum " + strconv.Itoa(maxBulkDeleteIDs) + " per request"})
		return
	}
	for _, id := range req.IDs {
		if strings.TrimSpace(id) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "'ids' must contain non-empty strings"})
			return
		}
	}

	result, err := h.usecase.DeleteQuestions(req.IDs)
	if err != nil {
		log.Printf("DeleteMultipleQuestions(count=%d) failed: %v", len(req.IDs), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"deleted": result.Deleted, "failed": result.Failed})
}

func (h *QuestionHandler) GetAllQuestions(c *gin.Context) {
	questions, err := h.usecase.GetAllQuestions()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// Opt-in pagination via ?page / ?page_size; untouched full list when absent
	// (storage-level paging is a follow-up, see pagination.go).
	resp := gin.H{"questions": questions}
	if err := applyPagination(c, resp, "questions", questions); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *QuestionHandler) GetQuestionByID(c *gin.Context) {
	id := c.Param("id")
	question, err := h.usecase.GetQuestionByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"question": question})
}
