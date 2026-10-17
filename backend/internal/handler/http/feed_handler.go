package http

import (
	"errors"
	"net/http"

	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// FeedHandler serves the personalised feed (plan §5.7).
type FeedHandler struct {
	uc          *usecase.FeedUsecase
	studentAuth gin.HandlerFunc
}

func NewFeedHandler(uc *usecase.FeedUsecase) *FeedHandler { return &FeedHandler{uc: uc} }

func (h *FeedHandler) RegisterRoutes(api *gin.RouterGroup) {
	api.GET("/feed", h.studentAuth, h.Get)
}

// GET /api/feed?program=&stream=&subject=&kind=&access=&cursor=
// program: omitted = active program, "mine" = all enrolments, or any program id (Explore).
func (h *FeedHandler) Get(c *gin.Context) {
	v, err := h.uc.Feed(studentID(c), usecase.FeedQuery{
		Program: c.Query("program"), Stream: c.Query("stream"), Subject: c.Query("subject"),
		Kind: c.Query("kind"), Access: c.Query("access"), Cursor: c.Query("cursor"),
	})
	if err != nil {
		if errors.Is(err, usecase.ErrBoardForbidden) {
			c.JSON(http.StatusForbidden, gin.H{"error": "student not found", "code": "forbidden"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load feed", "code": "error"})
		return
	}
	c.JSON(http.StatusOK, v)
}
