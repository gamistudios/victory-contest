package http

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

type ContestStatisticsHandler struct {
	usecase usecase.ContestStatisticsUsecase
}

func NewContestStatisticsHandler(u usecase.ContestStatisticsUsecase) *ContestStatisticsHandler {
	return &ContestStatisticsHandler{usecase: u}
}

func (h *ContestStatisticsHandler) RegisterRoutes(rg *gin.RouterGroup, adminAuth ...gin.HandlerFunc) {
	// Contest-wide analytics (including per-student performance) are
	// admin-only; the student app uses the per-student /submission stats.
	auth := rg.Group("", adminAuth...)
	auth.GET("/contest/:contest_id/statistics", h.GetContestStatistics)
	auth.GET("/contest/:contest_id/statistics/summary", h.GetContestSummary)
	auth.GET("/contest/:contest_id/statistics/students", h.GetStudentPerformances)
}

// GetContestStatistics handles GET /contest/:contest_id/statistics
func (h *ContestStatisticsHandler) GetContestStatistics(c *gin.Context) {
	contestID := c.Param("contest_id")
	if contestID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "contest_id is required",
		})
		return
	}

	// Parse query parameters for filters
	filters := domain.StatisticsFilters{
		Gender: c.Query("gender"),
		City:   c.Query("city"),
		School: c.Query("school"),
		Grade:  c.Query("grade"),
	}

	// Get statistics
	stats, err := h.usecase.GetContestStatistics(contestID, filters)
	if err != nil {
		log.Printf("Error getting contest statistics: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to get contest statistics",
			"error":   err.Error(),
		})
		return
	}

	if wantsCSV(c) {
		writeContestStatsCSV(c, contestID, stats)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    stats,
		"message": "Contest statistics retrieved successfully",
	})
}

// GetContestSummary handles GET /contest/:contest_id/statistics/summary
func (h *ContestStatisticsHandler) GetContestSummary(c *gin.Context) {
	contestID := c.Param("contest_id")
	if contestID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "contest_id is required",
		})
		return
	}

	// Get summary statistics (no filters)
	stats, err := h.usecase.GetContestSummary(contestID)
	if err != nil {
		log.Printf("Error getting contest summary: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to get contest summary",
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    stats,
		"message": "Contest summary retrieved successfully",
	})
}

// GetStudentPerformances handles GET /contest/:contest_id/statistics/students
func (h *ContestStatisticsHandler) GetStudentPerformances(c *gin.Context) {
	contestID := c.Param("contest_id")
	if contestID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "contest_id is required",
		})
		return
	}

	// Parse query parameters for filters
	filters := domain.StatisticsFilters{
		Gender: c.Query("gender"),
		City:   c.Query("city"),
		School: c.Query("school"),
		Grade:  c.Query("grade"),
	}

	// Parse pagination parameters
	page, err := strconv.Atoi(c.DefaultQuery("page", "1"))
	if err != nil || page < 1 {
		page = 1
	}

	pageSize, err := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if err != nil || pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	// CSV exports every matching student, not one page.
	if wantsCSV(c) {
		page, pageSize = 1, 1_000_000
	}

	// Get student performances
	performances, err := h.usecase.GetStudentPerformancesByContest(contestID, filters, page, pageSize)
	if err != nil {
		log.Printf("Error getting student performances: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to get student performances",
			"error":   err.Error(),
		})
		return
	}

	if wantsCSV(c) {
		rows := make([][]string, 0, len(performances.Students))
		for _, p := range performances.Students {
			rows = append(rows, []string{
				p.StudentID, p.StudentName, p.StudentGender, p.StudentCity, p.StudentSchool, p.StudentGrade,
				numCell(strconv.FormatFloat(p.Score, 'f', -1, 64)), numCell(strconv.Itoa(p.TotalQuestions)),
				numCell(strconv.Itoa(p.CorrectAnswers)), numCell(strconv.FormatFloat(p.Percentage, 'f', 1, 64)),
				p.Performance, p.TimeSpent, p.SubmissionTime,
			})
		}
		writeCSV(c, "contest-"+safeFileToken(contestID)+"-students.csv",
			[]string{"student_id", "name", "gender", "city", "school", "grade", "score", "total_questions", "correct_answers", "percentage", "performance", "time_spent", "submitted_at"}, rows)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    performances,
		"message": "Student performances retrieved successfully",
	})
}

// safeFileToken keeps only characters that are safe inside a Content-Disposition filename.
func safeFileToken(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_' {
			b.WriteRune(r)
		}
	}
	if b.Len() == 0 {
		return "export"
	}
	return b.String()
}

// writeContestStatsCSV flattens the per-contest breakdowns (gender, city,
// school, grade) into one long-format table plus the overall row.
func writeContestStatsCSV(c *gin.Context, contestID string, st *domain.ContestStatistics) {
	f1 := func(v float64) string { return numCell(strconv.FormatFloat(v, 'f', 1, 64)) }
	n := func(v int) string { return numCell(strconv.Itoa(v)) }
	row := func(dim, key string, cs domain.CategoryStats) []string {
		return []string{dim, key, n(cs.Total), n(cs.Passed), n(cs.Failed), f1(cs.PassRate), f1(cs.AverageScore)}
	}
	rows := [][]string{row("overall", "all", domain.CategoryStats{
		Total: st.TotalParticipants, Passed: st.PassedCount, Failed: st.FailedCount, PassRate: st.PassRate, AverageScore: st.AverageScore})}
	rows = append(rows,
		row("gender", "male", st.GenderStats.Male), row("gender", "female", st.GenderStats.Female),
		row("gender", "other", st.GenderStats.Other), row("gender", "unknown", st.GenderStats.Unknown))
	for _, dim := range []struct {
		name string
		m    map[string]domain.CategoryStats
	}{{"city", st.CityStats}, {"school", st.SchoolStats}, {"grade", st.GradeStats}} {
		keys := make([]string, 0, len(dim.m))
		for k := range dim.m {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			rows = append(rows, row(dim.name, k, dim.m[k]))
		}
	}
	writeCSV(c, "contest-"+safeFileToken(contestID)+"-statistics.csv",
		[]string{"dimension", "key", "total", "passed", "failed", "pass_rate", "average_score"}, rows)
}

// ---- Phase 5: scope-based analytics (GET /api/admin/analytics/*) ----------

// RegisterAnalyticsRoutes mounts the scope analytics under the given group
// (the router passes /api/admin/analytics behind adminAuth + a role gate).
// Every route accepts the shared scope query (program_id, stream_id - both
// repeatable - subject_id, chapter_id) plus from/to dates and ?format=csv.
func (h *ContestStatisticsHandler) RegisterAnalyticsRoutes(rg *gin.RouterGroup, mws ...gin.HandlerFunc) {
	g := rg.Group("", mws...)
	g.GET("", h.analyticsSection("overview"))
	g.GET("/overview", h.analyticsSection("overview"))
	g.GET("/program", h.analyticsSection("program"))
	g.GET("/stream", h.analyticsSection("stream"))
	g.GET("/subject", h.analyticsSection("subject"))
	g.GET("/region", h.analyticsSection("region"))
	g.GET("/distribution", h.analyticsSection("distribution"))
	g.GET("/competency", h.analyticsSection("competency"))
	g.GET("/summary", h.analyticsSection("summary"))
}

// parseAnalyticsQuery builds the AnalyticsQuery from the request, reusing
// domain.ScopeFilter, and pins assigned admins to their programs.
func parseAnalyticsQuery(c *gin.Context) (domain.AnalyticsQuery, bool) {
	f := domain.ScopeFilter{
		SubjectID: strings.TrimSpace(c.Query("subject_id")),
		ChapterID: strings.TrimSpace(c.Query("chapter_id")),
	}
	for _, v := range c.QueryArray("program_id") {
		f.ProgramIDs = append(f.ProgramIDs, splitCSV(v)...)
	}
	for _, v := range c.QueryArray("stream_id") {
		f.StreamIDs = append(f.StreamIDs, splitCSV(v)...)
	}
	if !clampScopeFilter(c, &f) {
		return domain.AnalyticsQuery{}, false
	}
	return domain.AnalyticsQuery{Filter: f, From: strings.TrimSpace(c.Query("from")), To: strings.TrimSpace(c.Query("to"))}, true
}

func (h *ContestStatisticsHandler) analyticsSection(section string) gin.HandlerFunc {
	return func(c *gin.Context) {
		q, ok := parseAnalyticsQuery(c)
		if !ok {
			c.JSON(http.StatusForbidden, gin.H{"error": "you are not assigned to this program"})
			return
		}
		res, err := h.usecase.GetScopeAnalytics(q)
		if err != nil {
			if errors.Is(err, usecase.ErrBadAnalyticsRange) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "from/to must be YYYY-MM-DD or RFC 3339, and from must not be after to"})
				return
			}
			log.Printf("scope analytics: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to compute analytics"})
			return
		}
		if wantsCSV(c) {
			writeAnalyticsCSV(c, section, res)
			return
		}
		switch section {
		case "program":
			c.JSON(http.StatusOK, gin.H{"totals": res.Totals, "by_program": res.ByProgram, "generated_at": res.GeneratedAt})
		case "stream":
			c.JSON(http.StatusOK, gin.H{"totals": res.Totals, "by_stream": res.ByStream, "generated_at": res.GeneratedAt})
		case "subject":
			c.JSON(http.StatusOK, gin.H{"totals": res.Totals, "by_subject": res.BySubject, "generated_at": res.GeneratedAt})
		case "region":
			c.JSON(http.StatusOK, gin.H{"totals": res.Totals, "by_region": res.ByRegion, "generated_at": res.GeneratedAt})
		case "distribution":
			c.JSON(http.StatusOK, gin.H{"totals": res.Totals, "distribution": res.Distribution, "generated_at": res.GeneratedAt})
		case "competency":
			c.JSON(http.StatusOK, gin.H{"competency": res.Competency, "generated_at": res.GeneratedAt})
		case "summary":
			c.JSON(http.StatusOK, gin.H{"summary": res.Summary, "summary_source": res.SummarySource, "totals": res.Totals, "generated_at": res.GeneratedAt})
		default:
			c.JSON(http.StatusOK, res)
		}
	}
}

func bucketRows(list []domain.AnalyticsBucket, label func(domain.AnalyticsBucket) []string) [][]string {
	rows := make([][]string, 0, len(list))
	for _, b := range list {
		r := label(b)
		r = append(r, numCell(strconv.Itoa(b.Attempts)), numCell(strconv.Itoa(b.Students)),
			numCell(strconv.FormatFloat(b.AvgPercent, 'f', 1, 64)), numCell(strconv.FormatFloat(b.PassRate, 'f', 1, 64)),
			numCell(strconv.FormatFloat(b.AvgPoints, 'f', 1, 64)))
		rows = append(rows, r)
	}
	return rows
}

func writeAnalyticsCSV(c *gin.Context, section string, a *domain.ScopeAnalytics) {
	tail := []string{"attempts", "students", "avg_percent", "pass_rate", "avg_points"}
	name := "analytics-" + section + ".csv"
	switch section {
	case "program":
		writeCSV(c, name, append([]string{"program_id"}, tail...), bucketRows(a.ByProgram, func(b domain.AnalyticsBucket) []string { return []string{b.ProgramID} }))
	case "stream":
		writeCSV(c, name, append([]string{"program_id", "stream_id"}, tail...), bucketRows(a.ByStream, func(b domain.AnalyticsBucket) []string { return []string{b.ProgramID, b.StreamID} }))
	case "subject":
		writeCSV(c, name, append([]string{"program_id", "subject_id"}, tail...), bucketRows(a.BySubject, func(b domain.AnalyticsBucket) []string { return []string{b.ProgramID, b.SubjectID} }))
	case "region":
		writeCSV(c, name, append([]string{"region"}, tail...), bucketRows(a.ByRegion, func(b domain.AnalyticsBucket) []string { return []string{b.Region} }))
	case "distribution":
		rows := make([][]string, 0, len(a.Distribution))
		for _, d := range a.Distribution {
			rows = append(rows, []string{numCell(strconv.Itoa(d.From)), numCell(strconv.Itoa(d.To)), numCell(strconv.Itoa(d.Count))})
		}
		writeCSV(c, name, []string{"from_percent", "to_percent", "attempts"}, rows)
	case "competency":
		rows := make([][]string, 0, len(a.Competency))
		for _, k := range a.Competency {
			rows = append(rows, []string{k.ProgramID, k.SubjectID, k.ChapterID, numCell(strconv.Itoa(k.Attempts)), numCell(strconv.Itoa(k.Students)),
				numCell(strconv.Itoa(k.Correct)), numCell(strconv.Itoa(k.Total)), numCell(strconv.FormatFloat(k.Mastery, 'f', 1, 64))})
		}
		writeCSV(c, name, []string{"program_id", "subject_id", "chapter_id", "attempts", "students", "correct", "total", "mastery_percent"}, rows)
	default: // overview / summary: one row per metric
		rows := [][]string{
			{"attempts", numCell(strconv.Itoa(a.Totals.Attempts))},
			{"students", numCell(strconv.Itoa(a.Totals.Students))},
			{"avg_percent", numCell(strconv.FormatFloat(a.Totals.AvgPercent, 'f', 1, 64))},
			{"median_percent", numCell(strconv.FormatFloat(a.Totals.MedianPercent, 'f', 1, 64))},
			{"pass_rate", numCell(strconv.FormatFloat(a.Totals.PassRate, 'f', 1, 64))},
			{"total_points", numCell(fmt.Sprintf("%d", a.Totals.TotalPoints))},
		}
		writeCSV(c, "analytics-overview.csv", []string{"metric", "value"}, rows)
	}
}

