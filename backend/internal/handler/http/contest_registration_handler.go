package http

import (
	"errors"
	"net/http"
	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

type ContestRegistrationHandler struct {
	usecase usecase.ContestRegistrationUsecase
	// studentAuthMw (D5) is wired by NewRouter; nil in handler unit tests.
	studentAuthMw gin.HandlerFunc
}

func NewContestRegistrationHandler(u usecase.ContestRegistrationUsecase) *ContestRegistrationHandler {
	return &ContestRegistrationHandler{usecase: u}
}

func (h *ContestRegistrationHandler) RegisterRoutes(rg *gin.RouterGroup, adminAuth ...gin.HandlerFunc) {
	// Joining and checking one's own registration are student flows;
	// rewriting or removing registrations is admin-only.
	auth := rg.Group("", adminAuth...)
	auth.PUT("/:id", h.UpdateContestRegistration)
	auth.DELETE("/:id", h.DeleteContestRegistration)
	// D5: all student-facing registration routes require a student session,
	// and the id they act on must equal the token subject.
	rg.POST("/", withStudentAuth(h.studentAuthMw, h.AddContestRegistration)...)
	rg.GET("/check/:student_id/:contest_id", withStudentAuth(h.studentAuthMw, h.IsStudentRegisteredForContest)...)
	// isActive changes state (marks the registration active), so the canonical
	// verb is POST. The GET alias is a TRANSITIONAL shim: the student frontend
	// deployed today still calls GET on contest open, and a 405 there would
	// lock every student out of contests during a backend-first deploy. The
	// alias runs the exact same guarded handler (student session + id match),
	// so it adds no access; remove it once the new frontend is live.
	rg.POST("/isActive/:contest_id/:student_id", withStudentAuth(h.studentAuthMw, h.CheckStudentActiveInContest)...)
	rg.GET("/isActive/:contest_id/:student_id", withStudentAuth(h.studentAuthMw, h.CheckStudentActiveInContest)...)
	rg.GET("/contest/:contest_id", h.GetNumberOfRegisterationForContest)
}

func (h *ContestRegistrationHandler) AddContestRegistration(c *gin.Context) {
	var registration domain.ContestRegistrationDto
	if err := c.ShouldBindJSON(&registration); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !requireMatchingStudent(c, registration.StudentID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "student_id does not match the authenticated student"})
		return
	}
	id, err := h.usecase.AddContestRegistration(registration)
	if err != nil {
		if errors.Is(err, usecase.ErrAlreadyRegisteredForContest) {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"id": id})
}

func (h *ContestRegistrationHandler) UpdateContestRegistration(c *gin.Context) {
	id := c.Param("id")
	var update domain.ContestRegistration
	if err := c.ShouldBindJSON(&update); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	err := h.usecase.UpdateContestRegistration(id, update)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success"})
}

func (h *ContestRegistrationHandler) DeleteContestRegistration(c *gin.Context) {
	id := c.Param("id")
	err := h.usecase.DeleteContestRegistration(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success"})
}

func (h *ContestRegistrationHandler) IsStudentRegisteredForContest(c *gin.Context) {
	studentID := c.Param("student_id")
	contestID := c.Param("contest_id")
	if !requireMatchingStudent(c, studentID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "student_id does not match the authenticated student"})
		return
	}
	isRegistered, err := h.usecase.CheckRegistrationsByContestAndStudent(contestID, studentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"is_registered": isRegistered})
}
func (h *ContestRegistrationHandler) CheckStudentActiveInContest(c *gin.Context) {
	conId, studId := c.Param("contest_id"), c.Param("student_id")
	if !requireMatchingStudent(c, studId) {
		c.JSON(http.StatusForbidden, gin.H{"error": "student_id does not match the authenticated student"})
		return
	}
	isActive, err := h.usecase.CheckStudentActiveInContest(conId, studId)
	if err != nil {
		// Distinct mapping: "already active" is a conflict (unchanged 409 body
		// for the frontend), a missing registration is a 404, and anything
		// else (repository read/write failures, persistent conflicts) is a
		// real 500 — previously every error was reported as 409.
		switch {
		case errors.Is(err, usecase.ErrAlreadyRegisteredForContest):
			c.JSON(http.StatusConflict, gin.H{"error": "The user is active"})
		case errors.Is(err, usecase.ErrNotRegisteredForContest):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": isActive})
}

func (h *ContestRegistrationHandler) GetNumberOfRegisterationForContest(c *gin.Context) {
	conId := c.Param("contest_id")
	registerations, err := h.usecase.GetRegisterationForContest(conId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"err": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"registerations": len(registerations)})
}
