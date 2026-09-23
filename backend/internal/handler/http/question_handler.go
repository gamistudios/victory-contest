package http

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"victor-contest-go/internal/domain"
	"victor-contest-go/internal/repository"
	"victor-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

type QuestionHandler struct {
	usecase   usecase.QuestionUsecase
	imageRepo *repository.ImageRepository
}

func NewQuestionHandler(u usecase.QuestionUsecase, imgRepo *repository.ImageRepository) *QuestionHandler {
	return &QuestionHandler{usecase: u, imageRepo: imgRepo}
}

func (h *QuestionHandler) RegisterRoutes(rg *gin.RouterGroup, adminAuth ...gin.HandlerFunc) {
	// Question rows carry the correct answers — the student app never reads
	// /question directly (exam content arrives hydrated on the contest), so
	// the whole surface is admin-only.
	auth := rg.Group("", adminAuth...)
	auth.POST("/add", h.AddQuestion)
	auth.POST("/multiple-add", h.AddMultipleQuestions)
	auth.POST("/multiple-delete", h.DeleteMultipleQuestions)
	auth.PATCH("/:id", h.UpdateQuestion)
	auth.DELETE("/delete/:id", h.DeleteQuestion)
	auth.GET("/", h.GetAllQuestions)
	auth.GET("/:id", h.GetQuestionByID)
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

	fileHeader, err := c.FormFile("question_image")
	if err != nil && err != http.ErrMissingFile {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to get image from form"})
		return
	}

	if fileHeader != nil {
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
			file, err := fileHeader.Open()
			if err != nil {
				return "", err
			}
			defer file.Close()
			return h.imageRepo.UploadImage(file, "questions")
		}
		if url, err := upload("question_image"); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		} else if url != "" {
			patch.QuestionImg = &url
		}
		if url, err := upload("explanation_image"); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
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
