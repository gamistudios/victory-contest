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

// RevenueHandler serves GET /api/admin/reports/revenue (Phase 5): revenue by
// program / plan / coupon / month in whole ETB birr, JSON or ?format=csv.
type RevenueHandler struct {
	uc *usecase.RevenueReportUsecase
}

func NewRevenueHandler(uc *usecase.RevenueReportUsecase) *RevenueHandler { return &RevenueHandler{uc: uc} }

// RegisterRoutes mounts under /api/admin/reports behind adminAuth + a role gate.
func (h *RevenueHandler) RegisterRoutes(rg *gin.RouterGroup, mws ...gin.HandlerFunc) {
	g := rg.Group("", mws...)
	g.GET("/revenue", h.Revenue)
}

func (h *RevenueHandler) Revenue(c *gin.Context) {
	f := domain.ScopeFilter{}
	for _, v := range c.QueryArray("program_id") {
		f.ProgramIDs = append(f.ProgramIDs, splitCSV(v)...)
	}
	// Assigned admins only see revenue for their programs.
	if !clampScopeFilter(c, &f) {
		c.JSON(http.StatusForbidden, gin.H{"error": "you are not assigned to this program"})
		return
	}
	rep, err := h.uc.Report(domain.RevenueQuery{ProgramIDs: f.ProgramIDs, From: strings.TrimSpace(c.Query("from")), To: strings.TrimSpace(c.Query("to"))})
	if err != nil {
		if errors.Is(err, usecase.ErrBadAnalyticsRange) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "from/to must be YYYY-MM-DD or RFC 3339, and from must not be after to"})
			return
		}
		log.Printf("revenue report: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to build revenue report"})
		return
	}
	if !wantsCSV(c) {
		c.JSON(http.StatusOK, rep)
		return
	}
	group := strings.ToLower(strings.TrimSpace(c.DefaultQuery("group_by", "month")))
	var list []domain.RevenueRow
	switch group {
	case "program":
		list = rep.ByProgram
	case "plan":
		list = rep.ByPlan
	case "coupon":
		list = rep.ByCoupon
	case "month":
		list = rep.ByMonth
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "group_by must be program, plan, coupon or month"})
		return
	}
	rows := make([][]string, 0, len(list)+1)
	for _, r := range list {
		rows = append(rows, []string{r.Key, r.Label, numCell(strconv.Itoa(r.Payments)), numCell(strconv.FormatInt(r.Revenue, 10))})
	}
	rows = append(rows, []string{"TOTAL", "", numCell(strconv.Itoa(rep.Totals.Payments)), numCell(strconv.FormatInt(rep.Totals.Revenue, 10))})
	writeCSV(c, "revenue-by-"+group+".csv", []string{group, "label", "payments", "revenue_etb"}, rows)
}
