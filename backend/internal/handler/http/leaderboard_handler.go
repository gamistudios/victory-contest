package http

import (
	"errors"
	"net/http"

	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// LeaderboardHandler serves the precomputed boards (plan §5.5).
type LeaderboardHandler struct {
	uc          *usecase.LeaderboardUsecase
	studentAuth gin.HandlerFunc
}

func NewLeaderboardHandler(uc *usecase.LeaderboardUsecase) *LeaderboardHandler {
	return &LeaderboardHandler{uc: uc}
}

func (h *LeaderboardHandler) RegisterRoutes(api *gin.RouterGroup, adminAuth gin.HandlerFunc) {
	api.GET("/leaderboard", h.studentAuth, h.Get)
	api.GET("/leaderboard/programs", h.studentAuth, h.Programs)
	api.GET("/admin/leaderboard", adminAuth, h.AdminGet)
}

func (h *LeaderboardHandler) fail(c *gin.Context, err error) {
	switch {
	case errors.Is(err, usecase.ErrBadPeriod):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "invalid_period"})
	case errors.Is(err, usecase.ErrBoardForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error(), "code": "board_forbidden"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load leaderboard", "code": "error"})
	}
}

// GET /api/leaderboard?period=day|week|month|all&program=&stream=
func (h *LeaderboardHandler) Get(c *gin.Context) {
	v, err := h.uc.Board(studentID(c), c.Query("period"), c.Query("program"), c.Query("stream"))
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, v)
}

// GET /api/leaderboard/programs: the programs (and the student's stream in each) that have a board.
func (h *LeaderboardHandler) Programs(c *gin.Context) {
	en, primary, err := h.uc.BoardsForStudent(studentID(c))
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"primary_program_id": primary, "enrollments": en})
}

// GET /api/admin/leaderboard?contest_id= or ?period=&program=&stream= (view-only).
func (h *LeaderboardHandler) AdminGet(c *gin.Context) {
	v, err := h.uc.AdminBoard(c.Query("contest_id"), c.Query("period"), c.Query("program"), c.Query("stream"))
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, v)
}
