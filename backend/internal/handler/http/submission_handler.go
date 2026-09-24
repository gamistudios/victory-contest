package http

import (
	"errors"
	"net/http"
	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

type SubmissionHandler struct {
	usecase usecase.SubmissionUsecase
	// studentAuthMw is wired by NewRouter; when set, POST / requires a
	// student token whose Telegram id equals student.student_id (S2).
	studentAuthMw gin.HandlerFunc
}

func NewSubmissionHandler(u usecase.SubmissionUsecase) *SubmissionHandler {
	return &SubmissionHandler{usecase: u}
}

func (h *SubmissionHandler) RegisterRoutes(rg *gin.RouterGroup, adminAuth ...gin.HandlerFunc) {
	// Submitting answers and reading one's own rank/editorial/statistics are
	// student flows; cross-student rosters and deletion are admin-only.
	auth := rg.Group("", adminAuth...)
	auth.GET("/", h.GetAllSubmissions)
	auth.GET("/contest/:contest_id", h.GetSubmissionsByContest)
	auth.GET("/student/:student_id", h.GetSubmissionsByStudent)
	auth.GET("/:id", h.GetSubmissionByID)
	auth.DELETE("/:id", h.DeleteSubmission)
	rg.POST("/", withStudentAuth(h.studentAuthMw, h.AddSubmission)...)
	rg.GET("/leaderboard", h.GetLeaderboardByTimeFrame)
	rg.GET("/rank/:conId", h.GetRankForContest)
	rg.GET("/editorial/:student_id", h.GetStudentEditorial)
	rg.GET("/statistics-profile/:student_id", h.GetStudentProfileStatistics)
	rg.GET("/statistics/:student_id", h.GetStudentStatistics)
}

func (h *SubmissionHandler) AddSubmission(c *gin.Context) {
	var submission domain.SubmissionDto
	if err := c.ShouldBindJSON(&submission); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Submissions may only be filed under the authenticated student (S2):
	// student.student_id is the Telegram id the frontend took from the WebApp.
	if !requireMatchingStudent(c, submission.Student.ID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "student.student_id does not match the authenticated student"})
		return
	}

	// The usecase grades server-side; `score` in the response is the OFFICIAL
	// score, not what the client claimed (README §9 #12).
	id, score, err := h.usecase.AddSubmission(submission)
	if err != nil {
		switch {
		case errors.Is(err, usecase.ErrContestNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		case errors.Is(err, usecase.ErrContestHasNoQuestions):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		case errors.Is(err, usecase.ErrNoStudentID):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id, "score": score})
}

func (h *SubmissionHandler) GetAllSubmissions(c *gin.Context) {
	submissions, err := h.usecase.GetAllSubmissions()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// Opt-in pagination via ?page / ?page_size; untouched full list when absent
	// (storage-level paging is a follow-up, see pagination.go).
	resp := gin.H{"submissions": submissions}
	if err := applyPagination(c, resp, "submissions", submissions); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (h *SubmissionHandler) GetStudentStatistics(c *gin.Context) {
	userId := c.Param("student_id")
	userStat, err := h.usecase.GetStudentStatistics(userId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"statistics": userStat})
}

func (h *SubmissionHandler) GetStudentProfileStatistics(c *gin.Context) {
	userId := c.Param("student_id")
	stat, err := h.usecase.GetStudentProfileStatistics(userId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"stat": stat})
}

func (h *SubmissionHandler) GetSubmissionByID(c *gin.Context) {
	id := c.Param("id")
	submission, err := h.usecase.GetSubmissionByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"submission": submission})
}

// DeleteSubmission serves DELETE /api/submission/:id. 404 when the row does
// not exist (the repository delete is conditional, so no double-read), 200
// {"message":"success"} after a successful delete. No auth yet — this codebase
// has no auth middleware (tracked in README #6), matching the other delete
// endpoints.
func (h *SubmissionHandler) DeleteSubmission(c *gin.Context) {
	id := c.Param("id")
	if err := h.usecase.DeleteSubmission(id); err != nil {
		if errors.Is(err, usecase.ErrSubmissionNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success"})
}

func (h *SubmissionHandler) GetSubmissionsByContest(c *gin.Context) {
	contestID := c.Param("contest_id")
	submissions, err := h.usecase.GetSubmissionsByContest(contestID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"submissions": submissions})
}

func (h *SubmissionHandler) GetSubmissionsByStudent(c *gin.Context) {
	studentID := c.Param("student_id")
	submissions, err := h.usecase.GetSubmissionsByStudent(studentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"submissions": submissions})
}
func (h *SubmissionHandler) GetLeaderboardByTimeFrame(c *gin.Context) {
	timeFrame := c.Query("timeFrame")
	leaderboard, err := h.usecase.GetLeaderboardByTimeFrame(timeFrame)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"leaderboard": leaderboard})
}
func (h *SubmissionHandler) GetRankForContest(c *gin.Context) {
	conId := c.Param("conId")

	rankings, err := h.usecase.GetRankingsForContest(conId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"rankings": rankings})

}
func (h *SubmissionHandler) GetStudentEditorial(c *gin.Context) {
	studId, conId := c.Param("student_id"), c.Query("contest_id")
	if conId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "please specify the contest Id"})
		return
	}
	result, err := h.usecase.GetStudentEditorial(conId, studId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"editorial":    result.Editorial,
		"participated": result.Participated,
		"message":      result.Message,
	})
}
