package http

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"victor-contest-go/internal/domain"
	"victor-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

type StudentHandler struct {
	usecase             usecase.StudentUsecase
	notificationService usecase.NotificationUsecase
}

func NewStudentHandler(u usecase.StudentUsecase, notificationService usecase.NotificationUsecase) *StudentHandler {
	return &StudentHandler{usecase: u, notificationService: notificationService}
}

func (h *StudentHandler) RegisterRoutes(rg *gin.RouterGroup, adminAuth ...gin.HandlerFunc) {
	// Registration, self-profile read/update and public rank boards stay
	// open for the mini-app; rosters, paid lists and admin analytics do not.
	auth := rg.Group("", adminAuth...)
	auth.DELETE("/:id", h.DeleteStudent)
	auth.GET("/", h.GetStudents)
	auth.GET("/paid", h.GetPaidStudents)
	auth.GET("/quickstat/:id", h.GetQuickStat)
	auth.GET("/profile-admin/:student_id", h.GetUserStatForAdmin)
	rg.POST("/", h.AddStudent)
	rg.PUT("/:id", h.UpdateStudent)
	rg.GET("/rank", h.GetStudentRankings)
	rg.GET("/rank/:contest_id", h.GetStudentRankingsByContest)
	rg.GET("/:id", h.GetStudentByID)
	rg.GET("/grades-and-schools", h.GetGradesAndSchools)
	rg.GET("/profile/:id", h.GetUserProfile)
}

func (h *StudentHandler) AddStudent(c *gin.Context) {
	var student domain.Student
	if err := c.ShouldBindJSON(&student); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	err := h.usecase.AddStudent(student)
	if err != nil {
		if errors.Is(err, usecase.ErrStudentAlreadyExists) {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	student.IsPremium = false
	c.JSON(http.StatusOK, gin.H{"student": student})
}

func (h *StudentHandler) UpdateStudent(c *gin.Context) {
	id := c.Param("id")
	var student domain.Student
	if err := c.ShouldBindJSON(&student); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Set the ID from the URL parameter
	student.ID = id

	err := h.usecase.UpdateStudent(student)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

func (h *StudentHandler) GetStudents(c *gin.Context) {
	students, err := h.usecase.GetStudents()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// Opt-in pagination via ?page / ?page_size; untouched full list when absent
	// (storage-level paging is a follow-up, see pagination.go).
	resp := gin.H{"students": students}
	if err := applyPagination(c, resp, "students", students); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *StudentHandler) GetPaidStudents(c *gin.Context) {
	students, err := h.usecase.GetPaidStudents()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"students": students})
}

// GetQuickStat serves GET /api/student/quickstat/:id (admin-gated). The
// usecase aggregates real points/submissions/payment data; an unknown student
// id is a 404 instead of a 200 with a fabricated placeholder (README §9 #48).
func (h *StudentHandler) GetQuickStat(c *gin.Context) {
	id := c.Param("id")
	stat, err := h.usecase.GetQuickStat(id)
	if err != nil {
		if errors.Is(err, usecase.ErrStudentNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"stat": stat})
}

func (h *StudentHandler) GetStudentRankings(c *gin.Context) {
	rankings, err := h.usecase.GetStudentRankings()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"rankings": rankings})
}

// GetStudentRankingsByContest serves GET /api/student/rank/:contest_id. An
// unknown contest id is a 404 so clients can distinguish it from a contest
// with no submissions yet (empty but 200).
func (h *StudentHandler) GetStudentRankingsByContest(c *gin.Context) {
	contestID := c.Param("contest_id")
	rankings, err := h.usecase.GetStudentRankingsByContest(contestID)
	if err != nil {
		if errors.Is(err, usecase.ErrContestNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"rankings": rankings})
}

func (h *StudentHandler) GetStudentByID(c *gin.Context) {
	id := c.Param("id")
	student, err := h.usecase.GetStudentByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if student != nil && student.Badge == nil {
		student.Badge = make([]string, 0)
	}
	c.JSON(http.StatusOK, gin.H{"student": student})
}

func (h *StudentHandler) GetGradesAndSchools(c *gin.Context) {
	data, err := h.usecase.GetGradesAndSchools()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *StudentHandler) GetUserProfile(c *gin.Context) {
	id := c.Param("id")
	profile, err := h.usecase.GetUserProfile(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": profile})
}
func (r *StudentHandler) GetUserStatForAdmin(c *gin.Context) {
	studId := c.Param("student_id")
	profile, err := r.usecase.GetUserStatForAdmin(studId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "something went wrong"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"profile": profile})

}

func (h *StudentHandler) DeleteStudent(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Student ID is required"})
		return
	}

	var student *domain.Student
	var err error

	// Check if the ID looks like a Telegram ID (numeric) or a UUID
	// If it's numeric, try to find by Telegram ID first
	if _, err := strconv.Atoi(id); err == nil {
		// It's numeric, try to find by Telegram ID
		student, err = h.usecase.GetStudentByTelegramID(id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check if student exists: " + err.Error()})
			return
		}
		if student == nil {
			// Try by regular ID as fallback
			student, err = h.usecase.GetStudentByID(id)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check if student exists: " + err.Error()})
				return
			}
		}
	} else {
		// It's not numeric, try by regular ID
		student, err = h.usecase.GetStudentByID(id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check if student exists: " + err.Error()})
			return
		}
	}

	if student == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Student not found"})
		return
	}

	// Delete the student using the actual database ID
	log.Printf("deleting student: database id=%s (lookup key=%s)", student.ID, id)
	err = h.usecase.DeleteStudent(student.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete student: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Student deleted successfully"})
}
