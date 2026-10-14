package http

import (
	"errors"
	"log"
	"net/http"

	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// EnrollmentHandler: student self-service (own token) and admin management of
// enrollments. Replaces the student self-switch of level/stream (D8).
type EnrollmentHandler struct {
	uc          *usecase.EnrollmentUsecase
	studentAuth gin.HandlerFunc
}

func NewEnrollmentHandler(uc *usecase.EnrollmentUsecase) *EnrollmentHandler {
	return &EnrollmentHandler{uc: uc}
}

func (h *EnrollmentHandler) RegisterRoutes(api *gin.RouterGroup, adminAuth gin.HandlerFunc) {
	stu := api.Group("/me", h.studentAuth)
	stu.GET("/enrollments", h.Mine)
	stu.POST("/enrollments", h.Enroll)
	stu.DELETE("/enrollments/:program_id", h.Leave)
	stu.PUT("/enrollments/primary", h.Primary)
	stu.PUT("/enrollments/:program_id/stream", h.Stream)

	adm := api.Group("/enrollment-admin", adminAuth)
	adm.GET("/students/:student_id", h.AdminList)
	adm.POST("/students/:student_id", h.AdminEnroll)
	adm.PUT("/students/:student_id/:program_id/stream", h.AdminStream)
	adm.DELETE("/students/:student_id/:program_id", h.AdminLeave)
	adm.POST("/bulk", h.Bulk)
}

func enrollErr(c *gin.Context, err error) {
	switch {
	case errors.Is(err, usecase.ErrStudentNotFound), errors.Is(err, usecase.ErrNotEnrolled):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, usecase.ErrAlreadyEnrolled):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	case errors.Is(err, usecase.ErrSuspendedStudent):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
	case errors.Is(err, usecase.ErrUnknownProgram), errors.Is(err, usecase.ErrProgramClosed),
		errors.Is(err, usecase.ErrStreamRequired), errors.Is(err, usecase.ErrStreamNotAllowed),
		errors.Is(err, usecase.ErrLastEnrollment), errors.Is(err, usecase.ErrInvalidLocation):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		log.Printf("enrollment: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
	}
}

type enrollIn struct {
	ProgramID string `json:"program_id"`
	StreamID  string `json:"stream_id"`
}

func (h *EnrollmentHandler) respond(c *gin.Context, studentID string, err error) {
	if err != nil {
		enrollErr(c, err)
		return
	}
	es, primary, err := h.uc.List(studentID)
	if err != nil {
		enrollErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"enrollments": es, "primary_program_id": primary})
}

func (h *EnrollmentHandler) me(c *gin.Context) string { return c.GetString(StudentUserIDContextKey) }

func (h *EnrollmentHandler) Mine(c *gin.Context) { h.respond(c, h.me(c), nil) }

func (h *EnrollmentHandler) Enroll(c *gin.Context) {
	var in enrollIn
	if err := c.ShouldBindJSON(&in); err != nil || in.ProgramID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "program_id is required"})
		return
	}
	_, err := h.uc.Enroll(h.me(c), in.ProgramID, in.StreamID, true)
	h.respond(c, h.me(c), err)
}

func (h *EnrollmentHandler) Leave(c *gin.Context) {
	_, err := h.uc.Leave(h.me(c), c.Param("program_id"))
	h.respond(c, h.me(c), err)
}

func (h *EnrollmentHandler) Primary(c *gin.Context) {
	var in enrollIn
	if err := c.ShouldBindJSON(&in); err != nil || in.ProgramID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "program_id is required"})
		return
	}
	h.respond(c, h.me(c), h.uc.SetPrimary(h.me(c), in.ProgramID))
}

func (h *EnrollmentHandler) Stream(c *gin.Context) {
	var in enrollIn
	_ = c.ShouldBindJSON(&in)
	_, err := h.uc.SetStream(h.me(c), c.Param("program_id"), in.StreamID, true)
	h.respond(c, h.me(c), err)
}

func (h *EnrollmentHandler) AdminList(c *gin.Context) { h.respond(c, c.Param("student_id"), nil) }

func (h *EnrollmentHandler) AdminEnroll(c *gin.Context) {
	var in enrollIn
	if err := c.ShouldBindJSON(&in); err != nil || in.ProgramID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "program_id is required"})
		return
	}
	_, err := h.uc.Enroll(c.Param("student_id"), in.ProgramID, in.StreamID, false)
	h.respond(c, c.Param("student_id"), err)
}

func (h *EnrollmentHandler) AdminStream(c *gin.Context) {
	var in enrollIn
	_ = c.ShouldBindJSON(&in)
	_, err := h.uc.SetStream(c.Param("student_id"), c.Param("program_id"), in.StreamID, false)
	h.respond(c, c.Param("student_id"), err)
}

func (h *EnrollmentHandler) AdminLeave(c *gin.Context) {
	_, err := h.uc.Leave(c.Param("student_id"), c.Param("program_id"))
	h.respond(c, c.Param("student_id"), err)
}

func (h *EnrollmentHandler) Bulk(c *gin.Context) {
	var in struct {
		StudentIDs []string `json:"student_ids"`
		enrollIn
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.ProgramID == "" || len(in.StudentIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "student_ids and program_id are required"})
		return
	}
	failed := h.uc.BulkEnroll(in.StudentIDs, in.ProgramID, in.StreamID)
	c.JSON(http.StatusOK, gin.H{"requested": len(in.StudentIDs), "failed": failed})
}
