package http

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// HabitHandler serves Training & Habit Development (plan §5.10). Student
// routes only ever touch the session's own log (the student id comes from the
// token, never the body); oversight and nudges are admin-only. Nothing here
// touches the leaderboard or exposes one student's habits to another
// (decision 16).
type HabitHandler struct {
	uc          *usecase.HabitUsecase
	studentAuth gin.HandlerFunc
}

func NewHabitHandler(uc *usecase.HabitUsecase) *HabitHandler { return &HabitHandler{uc: uc} }

// RegisterRoutes: roleGate is requireRole(admin) and programGate is
// requireProgram, both from the Phase 5 role layer, so an assigned admin can
// only touch Training programs they are assigned to.
func (h *HabitHandler) RegisterRoutes(api *gin.RouterGroup, adminAuth, roleGate, programGate gin.HandlerFunc) {
	stu := api.Group("/habits", h.studentAuth)
	stu.POST("/start", h.Start)
	stu.GET("/today", h.Today)
	stu.PUT("/check", h.Check)
	stu.GET("/plans", h.Plans)
	stu.GET("/me", h.Me)

	adm := api.Group("/admin/habits", adminAuth, roleGate, programGate)
	adm.GET("/plans", h.AdminPlans)
	adm.GET("/plans/:id", h.AdminPlan)
	adm.POST("/plans", h.AdminSave)
	adm.PUT("/plans/:id", h.AdminSave)
	adm.DELETE("/plans/:id", h.AdminDelete)
	adm.GET("/oversight", h.Oversight)
	adm.POST("/nudge", h.Nudge)
}

func (h *HabitHandler) fail(c *gin.Context, err error) {
	var le *usecase.LockedError
	if errors.As(err, &le) {
		c.JSON(http.StatusPaymentRequired, gin.H{"error": err.Error(), "code": "locked", "lock": le.Lock})
		return
	}
	status, code := http.StatusInternalServerError, "error"
	switch {
	case errors.Is(err, usecase.ErrHabitPlanNotFound), errors.Is(err, usecase.ErrStudentNotFound):
		status, code = http.StatusNotFound, "not_found"
	case errors.Is(err, usecase.ErrHabitNotStarted):
		status, code = http.StatusNotFound, "not_started"
	case errors.Is(err, usecase.ErrNotEnrolled), errors.Is(err, usecase.ErrSuspendedStudent):
		status, code = http.StatusForbidden, "forbidden"
	case errors.Is(err, usecase.ErrHabitItemUnknown):
		status, code = http.StatusBadRequest, "unknown_item"
	case errors.Is(err, usecase.ErrHabitFinished):
		status, code = http.StatusConflict, "track_finished"
	case errors.Is(err, usecase.ErrHabitInvalid), errors.Is(err, usecase.ErrHabitNoFeature):
		status, code = http.StatusBadRequest, "invalid"
	}
	if status == http.StatusInternalServerError {
		log.Printf("habits: %v", err)
		c.JSON(status, gin.H{"error": "internal server error", "code": code})
		return
	}
	c.JSON(status, gin.H{"error": err.Error(), "code": code})
}

type habitPlanIn struct {
	PlanID string `json:"plan_id"`
	ItemID string `json:"item_id"`
}

// POST /api/habits/start {plan_id}
func (h *HabitHandler) Start(c *gin.Context) {
	var in habitPlanIn
	if err := c.ShouldBindJSON(&in); err != nil || in.PlanID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "plan_id is required", "code": "invalid"})
		return
	}
	v, err := h.uc.Start(studentID(c), in.PlanID)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, v)
}

// GET /api/habits/today?plan_id=
func (h *HabitHandler) Today(c *gin.Context) {
	pid := c.Query("plan_id")
	if pid == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "plan_id is required", "code": "invalid"})
		return
	}
	v, err := h.uc.Today(studentID(c), pid)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, v)
}

// PUT /api/habits/check {plan_id,item_id}; the date is server-derived.
func (h *HabitHandler) Check(c *gin.Context) {
	var in habitPlanIn
	if err := c.ShouldBindJSON(&in); err != nil || in.PlanID == "" || in.ItemID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "plan_id and item_id are required", "code": "invalid"})
		return
	}
	v, err := h.uc.Check(studentID(c), in.PlanID, in.ItemID)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, v)
}

// GET /api/habits/plans
func (h *HabitHandler) Plans(c *gin.Context) {
	v, err := h.uc.Plans(studentID(c))
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"plans": v})
}

// GET /api/habits/me
func (h *HabitHandler) Me(c *gin.Context) {
	v, err := h.uc.Me(studentID(c))
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, v)
}

// adminPrograms is the program set the admin may see: their assignment, or the
// requested program (already vetted by requireProgram); nil means every program.
func adminPrograms(c *gin.Context) []string {
	if p := strings.TrimSpace(c.Query("program_id")); p != "" {
		return []string{p}
	}
	return adminProgramsFromContext(c)
}

func (h *HabitHandler) AdminPlans(c *gin.Context) {
	v, err := h.uc.ListPlansAdmin(adminPrograms(c))
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"plans": v})
}

func (h *HabitHandler) AdminPlan(c *gin.Context) {
	p, err := h.uc.GetPlan(c.Param("id"))
	if err != nil {
		h.fail(c, err)
		return
	}
	if !programAllowed(adminProgramsFromContext(c), p.ProgramID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "you are not assigned to this program"})
		return
	}
	c.JSON(http.StatusOK, p)
}

// POST /plans, PUT /plans/:id. Both the stored plan's program and the
// submitted one must be inside the admin's assignment.
func (h *HabitHandler) AdminSave(c *gin.Context) {
	var in domain.HabitPlan
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "code": "invalid"})
		return
	}
	assigned := adminProgramsFromContext(c)
	if id := c.Param("id"); id != "" {
		ex, err := h.uc.GetPlan(id)
		if err != nil {
			h.fail(c, err)
			return
		}
		if !programAllowed(assigned, ex.ProgramID) {
			c.JSON(http.StatusForbidden, gin.H{"error": "you are not assigned to this program"})
			return
		}
		in.ID = id
	} else {
		in.ID = ""
	}
	if !programAllowed(assigned, strings.TrimSpace(in.ProgramID)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "you are not assigned to this program"})
		return
	}
	p, err := h.uc.SavePlan(in)
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, p)
}

func (h *HabitHandler) AdminDelete(c *gin.Context) {
	p, err := h.uc.GetPlan(c.Param("id"))
	if err != nil {
		h.fail(c, err)
		return
	}
	if !programAllowed(adminProgramsFromContext(c), p.ProgramID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "you are not assigned to this program"})
		return
	}
	if err := h.uc.DeletePlan(p.ID); err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": p.ID})
}

// GET /api/admin/habits/oversight?program_id=&plan_id=&inactive_days=&order=asc|desc
func (h *HabitHandler) Oversight(c *gin.Context) {
	n, _ := strconv.Atoi(c.Query("inactive_days"))
	if n < 0 {
		n = 0
	}
	rows, err := h.uc.Oversight(usecase.HabitOversightFilter{
		ProgramIDs: adminPrograms(c), PlanID: c.Query("plan_id"),
		InactiveDays: n, Ascending: c.Query("order") == "asc",
	})
	if err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"rows": rows})
}

type habitNudgeIn struct {
	StudentID string `json:"student_id"`
	PlanID    string `json:"plan_id"`
	Message   string `json:"message"`
}

// POST /api/admin/habits/nudge
func (h *HabitHandler) Nudge(c *gin.Context) {
	var in habitNudgeIn
	if err := c.ShouldBindJSON(&in); err != nil || in.StudentID == "" || in.PlanID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "student_id and plan_id are required", "code": "invalid"})
		return
	}
	p, err := h.uc.GetPlan(in.PlanID)
	if err != nil {
		h.fail(c, err)
		return
	}
	if !programAllowed(adminProgramsFromContext(c), p.ProgramID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "you are not assigned to this program"})
		return
	}
	if err := h.uc.Nudge(in.StudentID, in.PlanID, in.Message); err != nil {
		h.fail(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"sent": true})
}
