package http

import (
	"encoding/csv"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// AssessmentHandler serves /api/assessments*, /api/attempts* and the admin
// attempt routes (plan §5.4.2). The student id always comes from the JWT.
type AssessmentHandler struct {
	uc          *usecase.AttemptUsecase
	studentAuth gin.HandlerFunc
}

func NewAssessmentHandler(uc *usecase.AttemptUsecase) *AssessmentHandler {
	return &AssessmentHandler{uc: uc}
}

func (h *AssessmentHandler) RegisterRoutes(api *gin.RouterGroup, adminAuth gin.HandlerFunc) {
	as := api.Group("/assessments", h.studentAuth)
	as.GET("", h.List)
	as.GET("/:id", h.Get)
	as.GET("/:id/leaderboard", h.Leaderboard)
	as.POST("/:id/start", h.Start)
	at := api.Group("/attempts", h.studentAuth)
	at.PUT("/:id/answers", h.Autosave)
	at.POST("/:id/submit", h.Submit)
	at.GET("/:id/result", h.Result)

	adm := api.Group("/admin", adminAuth)
	adm.GET("/attempt-counts", h.AdminCounts)
	adm.GET("/assessments/:id/attempts", h.AdminList)
	adm.GET("/assessments/:id/attempts.csv", h.AdminCSV)
	adm.GET("/attempts/:id", h.AdminGet)
	adm.PATCH("/attempts/:id", h.AdminPatch)
}

func studentID(c *gin.Context) string { return c.GetString(StudentUserIDContextKey) }

func (h *AssessmentHandler) fail(c *gin.Context, err error) {
	code, status := "error", http.StatusInternalServerError
	switch {
	case errors.Is(err, usecase.ErrAlreadyAttempted):
		code, status = "already_attempted", http.StatusConflict
	case errors.Is(err, usecase.ErrNotOpenYet):
		code, status = "assessment_not_open", http.StatusForbidden
	case errors.Is(err, usecase.ErrWindowClosed):
		code, status = "assessment_closed", http.StatusForbidden
	case errors.Is(err, usecase.ErrAttemptExpired):
		code, status = "attempt_expired", http.StatusGone
	case errors.Is(err, usecase.ErrAttemptFinalised):
		code, status = "attempt_finalised", http.StatusConflict
	case errors.Is(err, usecase.ErrVersionConflict):
		code, status = "version_conflict", http.StatusConflict
	case errors.Is(err, usecase.ErrAttemptNotFound):
		code, status = "not_found", http.StatusNotFound
	case errors.Is(err, usecase.ErrForbidden):
		code, status = "forbidden", http.StatusForbidden
	}
	var le *usecase.LockedError
	if errors.As(err, &le) {
		c.JSON(http.StatusPaymentRequired, gin.H{"error": err.Error(), "code": "locked", "lock": le.Lock})
		return
	}
	body := gin.H{"error": err.Error(), "code": code}
	if code == "already_attempted" {
		body["attempt_id"] = c.GetString("attempt_id_hint")
	}
	c.JSON(status, body)
}

func (h *AssessmentHandler) List(c *gin.Context) {
	f := domain.ScopeFilter{SubjectID: c.Query("subject_id"), ChapterID: c.Query("chapter_id")}
	if v := c.QueryArray("program_id"); len(v) > 0 {
		f.ProgramIDs = v
	}
	if v := c.QueryArray("stream_id"); len(v) > 0 {
		f.StreamIDs = v
	}
	list, err := h.uc.ListAssessments(studentID(c), f)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, list)
}

func (h *AssessmentHandler) Get(c *gin.Context) {
	m, err := h.uc.GetAssessment(c.Param("id"), studentID(c))
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, m)
}

func (h *AssessmentHandler) Leaderboard(c *gin.Context) {
	rows, err := h.uc.Leaderboard(c.Param("id"))
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, rows)
}

func (h *AssessmentHandler) Start(c *gin.Context) {
	sid := studentID(c)
	c.Set("attempt_id_hint", "")
	res, err := h.uc.Start(c.Param("id"), sid)
	if err != nil {
		if errors.Is(err, usecase.ErrAlreadyAttempted) {
			c.Set("attempt_id_hint", c.Param("id")+"#"+sid+"#1")
		}
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, res)
}

func (h *AssessmentHandler) Autosave(c *gin.Context) {
	var in struct {
		Answers map[string]int `json:"answers"`
		Flagged []string       `json:"flagged"`
		Version int            `json:"version"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	v, now, err := h.uc.Autosave(c.Param("id"), studentID(c), in.Answers, in.Flagged, in.Version)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"version": v, "server_now": now})
}

func (h *AssessmentHandler) Submit(c *gin.Context) {
	var in struct {
		Answers map[string]int `json:"answers"`
	}
	_ = c.ShouldBindJSON(&in) // body optional: the last autosave is used when absent
	a, err := h.uc.Submit(c.Param("id"), studentID(c), in.Answers)
	if err != nil {
		h.fail(c, err)
		return
	}
	a.Answers = nil
	c.JSON(http.StatusOK, a)
}

func (h *AssessmentHandler) Result(c *gin.Context) {
	v, err := h.uc.Result(c.Param("id"), studentID(c))
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, v)
}

func (h *AssessmentHandler) AdminList(c *gin.Context) {
	list, err := h.uc.AdminAttempts(c.Param("id"), c.Query("label"))
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, list)
}

// AdminCSV exports the attempts of one assessment as CSV (plan §5.4.2).
func (h *AssessmentHandler) AdminCSV(c *gin.Context) {
	list, err := h.uc.AdminAttempts(c.Param("id"), c.Query("label"))
	if err != nil {
		h.fail(c, err)
		return
	}
	// The id goes into a header value and a download filename: keep it boring.
	safeID := strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_' {
			return r
		}
		return '_'
	}, c.Param("id"))
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="attempts-`+safeID+`.csv"`)
	w := csv.NewWriter(c.Writer)
	_ = w.Write([]string{"attempt_id", "student_id", "label", "status", "started_at", "submitted_at", "correct", "total", "is_late", "penalty_percent", "penalty_waived", "points", "duration_seconds", "excluded", "excluded_reason"})
	for _, a := range list {
		_ = w.Write([]string{a.ID, a.StudentID, a.Label(), a.Status, a.StartedAt, a.SubmittedAt,
			strconv.Itoa(a.Correct), strconv.Itoa(a.Total), strconv.FormatBool(a.IsLate), strconv.Itoa(a.PenaltyPercent),
			strconv.FormatBool(a.PenaltyWaived), strconv.Itoa(a.Points), strconv.Itoa(a.DurationSeconds),
			strconv.FormatBool(a.Excluded), a.ExcludedReason})
	}
	w.Flush()
}

func (h *AssessmentHandler) AdminCounts(c *gin.Context) {
	m, err := h.uc.AttemptCounts()
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, m)
}

func (h *AssessmentHandler) AdminGet(c *gin.Context) {
	a, err := h.uc.AdminGet(c.Param("id"))
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, a)
}

func (h *AssessmentHandler) AdminPatch(c *gin.Context) {
	var in struct {
		Action string `json:"action"`
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	a, err := h.uc.AdminAction(c.Param("id"), in.Action, in.Reason)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, a)
}
