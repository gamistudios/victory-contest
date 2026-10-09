package http

import (
	"errors"
	"fmt"
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
	auth.POST("/delete-all", h.DeleteAllQuestions)
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

	// Per-option images: option_image_1..N file parts, aligned to the option
	// index. Each is optional; a missing part leaves that option text-only.
	// The usecase normalizes the list to the option count on save.
	optionImages, err := h.readOptionImageFiles(c)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	question.OptionImages = optionImages

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

// readOptionImageFiles uploads any optional per-option image file parts
// (option_image_1 .. option_image_N) found in the request to Cloudinary and
// merges in any pre-existing Cloudinary URLs sent as option_image_url_1..N
// text fields. The result is an index-aligned list: position i-1 holds the
// URL for option i (freshly uploaded or carried-over), or "" when that option
// had neither. A freshly uploaded file wins over a carried-over URL in the
// same slot. The part list is discovered by scanning the multipart form, so
// the caller never needs to know the option count up front — the usecase
// normalizes the result to the final option count on merge.
func (h *QuestionHandler) readOptionImageFiles(c *gin.Context) ([]string, error) {
	if c.Request == nil || c.Request.MultipartForm == nil {
		return nil, nil
	}
	// Discover the option slots that carry an image part or a carried-over
	// URL, by scanning the multipart form's keys.
	maxIndex := 0
	for name := range c.Request.MultipartForm.File {
		if !strings.HasPrefix(name, "option_image_") {
			continue
		}
		if n, err := strconv.Atoi(strings.TrimPrefix(name, "option_image_")); err == nil && n > maxIndex {
			maxIndex = n
		}
	}
	for name, values := range c.Request.MultipartForm.Value {
		if !strings.HasPrefix(name, "option_image_url_") || len(values) == 0 {
			continue
		}
		n, err := strconv.Atoi(strings.TrimPrefix(name, "option_image_url_"))
		if err != nil || n < 1 {
			continue
		}
		if n > maxIndex {
			maxIndex = n
		}
	}
	if maxIndex == 0 {
		return nil, nil
	}

	urls := make([]string, maxIndex)
	// 1. Upload fresh option-image files.
	for i := 1; i <= maxIndex; i++ {
		field := "option_image_" + strconv.Itoa(i)
		fileHeader, err := c.FormFile(field)
		if err != nil {
			if err == http.ErrMissingFile {
				continue // this option has no new image
			}
			return nil, fmt.Errorf("failed to read option image part: %w", err)
		}
		if err := validateImageUpload(fileHeader); err != nil {
			return nil, fmt.Errorf("option image %d: %w", i, err)
		}
		file, err := fileHeader.Open()
		if err != nil {
			return nil, fmt.Errorf("failed to open option image part: %w", err)
		}
		imgURL, upErr := h.imageRepo.UploadImage(file, "questions")
		file.Close()
		if upErr != nil {
			return nil, fmt.Errorf("failed to upload option image %d: %w", i, upErr)
		}
		urls[i-1] = imgURL
	}
	// 2. Fill any slot without a fresh upload from a carried-over URL so an
	//    edit that keeps an existing option photo does not silently clear it.
	for i := 1; i <= maxIndex; i++ {
		if urls[i-1] != "" {
			continue
		}
		if v := c.PostForm("option_image_url_" + strconv.Itoa(i)); v != "" {
			urls[i-1] = v
		}
	}
	return urls, nil
}

// anyNonEmpty reports whether the URL list has at least one non-empty entry,
// so an all-empty option-image set is treated as "not provided" (a no-op)
// rather than a clear.
func anyNonEmpty(urls []string) bool {
	for _, u := range urls {
		if u != "" {
			return true
		}
	}
	return false
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

		// Per-option image parts: the panel only appends a file part for
		// options that actually carry an image, so we scan the multipart form
		// for option_image_N parts, upload them, and build an index-aligned
		// URL list (empty slots = ""). The usecase then normalizes the list
		// to the final option count, so a stale/over-long set can't desync.
		// We mark the field "provided" only when some part carried an image;
		// a fully-empty set on update is a no-op, not a clear.
		optionImages, err := h.readOptionImageFiles(c)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if anyNonEmpty(optionImages) {
			patch.OptionImages = &optionImages
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

// DeleteAllQuestions removes every stored question in one action. It lists all
// ids and bulk-deletes them in chunks of maxBulkDeleteIDs so the per-request
// cap is never exceeded no matter how large the bank is. It reuses the same
// DeleteQuestions usecase, so per-id failures are reported, not fatal.
func (h *QuestionHandler) DeleteAllQuestions(c *gin.Context) {
	all, err := h.usecase.GetAllQuestions()
	if err != nil {
		log.Printf("DeleteAllQuestions: list failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	ids := make([]string, 0, len(all))
	for _, q := range all {
		if q.ID != "" {
			ids = append(ids, q.ID)
		}
	}
	if len(ids) == 0 {
		c.JSON(http.StatusOK, gin.H{"deleted": []string{}, "failed": []usecase.BulkDeleteFailure{}})
		return
	}

	var result usecase.BulkDeleteResult
	for i := 0; i < len(ids); i += maxBulkDeleteIDs {
		end := i + maxBulkDeleteIDs
		if end > len(ids) {
			end = len(ids)
		}
		chunk, err := h.usecase.DeleteQuestions(ids[i:end])
		if err != nil {
			log.Printf("DeleteAllQuestions(chunk %d-%d) failed: %v", i, end, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		result.Deleted = append(result.Deleted, chunk.Deleted...)
		result.Failed = append(result.Failed, chunk.Failed...)
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
