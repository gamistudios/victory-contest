package http

import (
	"errors"
	"io"
	"log"
	"net/http"

	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

const academyMaxBody = 5 << 20 // 5 MB: modules carry markdown, decks and quizzes

// AcademyHandler serves the Victory Academy (Learn) API under /api/academy.
// Student routes require the student session JWT, /admin routes the admin cookie.
type AcademyHandler struct {
	uc *usecase.AcademyUsecase
}

func NewAcademyHandler(uc *usecase.AcademyUsecase) *AcademyHandler {
	return &AcademyHandler{uc: uc}
}

func academyFail(c *gin.Context, err error) {
	var ae *usecase.AcademyError
	if errors.As(err, &ae) {
		c.JSON(ae.Status, gin.H{"error": ae.Msg})
		return
	}
	log.Printf("academy: %s %s: %v", c.Request.Method, c.Request.URL.Path, err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
}

func academyBody(c *gin.Context) ([]byte, bool) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, academyMaxBody)
	raw, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or oversized request body"})
		return nil, false
	}
	return raw, true
}

func academyBind(c *gin.Context, v any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, academyMaxBody)
	if err := c.ShouldBindJSON(v); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return false
	}
	return true
}

// RegisterRoutes mounts the routes. A nil middleware leaves that surface
// ungated (handler tests only; NewRouter always passes both).
func (h *AcademyHandler) RegisterRoutes(rg *gin.RouterGroup, studentMw, adminMw gin.HandlerFunc, aiLimit gin.HandlerFunc) {
	st := rg.Group("")
	if studentMw != nil {
		st.Use(studentMw)
	}
	sid := func(c *gin.Context) string { return c.GetString(StudentUserIDContextKey) }

	st.GET("/me", func(c *gin.Context) {
		s, err := h.uc.Me(sid(c))
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"student": s})
	})
	st.PATCH("/me", func(c *gin.Context) {
		var b struct {
			LevelID  string `json:"level_id"`
			StreamID string `json:"stream_id"`
		}
		if !academyBind(c, &b) {
			return
		}
		s, err := h.uc.UpdateMe(sid(c), b.LevelID, b.StreamID)
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"student": s})
	})
	st.PUT("/me/target", func(c *gin.Context) {
		var b struct {
			TargetScore float64 `json:"target_score"`
		}
		if !academyBind(c, &b) {
			return
		}
		s, err := h.uc.SetTarget(sid(c), b.TargetScore)
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"student": s})
	})
	st.GET("/dashboard", func(c *gin.Context) {
		d, err := h.uc.Dashboard(sid(c))
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"dashboard": d})
	})
	st.GET("/programs", func(c *gin.Context) {
		p, s, err := h.uc.Programs()
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"programs": p, "streams": s})
	})
	st.GET("/subjects", func(c *gin.Context) {
		list, err := h.uc.Subjects(sid(c), c.Query("level_id"), c.Query("stream_id"))
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"subjects": list})
	})
	st.GET("/subjects/:id", func(c *gin.Context) {
		o, err := h.uc.SubjectOutline(sid(c), c.Param("id"))
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, o)
	})
	st.GET("/modules/:id", func(c *gin.Context) {
		d, err := h.uc.ModuleDetail(sid(c), c.Param("id"))
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, d)
	})
	st.POST("/modules/:id/progress", func(c *gin.Context) {
		var b usecase.AcademyProgressPatch
		if !academyBind(c, &b) {
			return
		}
		p, err := h.uc.PostModuleProgress(sid(c), c.Param("id"), b)
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"progress": p})
	})
	st.POST("/modules/:id/complete", func(c *gin.Context) {
		var b struct {
			Completed *bool `json:"completed"`
		}
		_ = c.ShouldBindJSON(&b) // body is optional
		completed := b.Completed == nil || *b.Completed
		r, err := h.uc.CompleteModule(sid(c), c.Param("id"), completed)
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, r)
	})
	st.POST("/referrals/claim", func(c *gin.Context) {
		var b struct {
			ReferrerID string `json:"referrer_id"`
			ModuleID   string `json:"module_id"`
		}
		if !academyBind(c, &b) {
			return
		}
		r, err := h.uc.ClaimReferral(sid(c), b.ReferrerID, b.ModuleID)
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"referral": r})
	})
	st.POST("/flashcard-reviews", func(c *gin.Context) {
		var b struct {
			ModuleID     string   `json:"module_id"`
			MasteredIDs  []string `json:"mastered_ids"`
			StrugglingID []string `json:"struggling_ids"`
		}
		if !academyBind(c, &b) {
			return
		}
		fp, err := h.uc.FlashcardReview(sid(c), b.ModuleID, b.MasteredIDs, b.StrugglingID)
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"flashcard_progress": fp})
	})
	st.POST("/quiz-attempts", func(c *gin.Context) {
		var b usecase.AcademyQuizAttemptInput
		if !academyBind(c, &b) {
			return
		}
		a, err := h.uc.RecordQuizAttempt(sid(c), b)
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(201, gin.H{"attempt": a})
	})
	st.GET("/quiz-attempts", func(c *gin.Context) {
		list, err := h.uc.QuizAttempts(sid(c), c.Query("module_id"))
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"attempts": list})
	})

	ai := st.Group("/ai")
	if aiLimit != nil {
		ai.Use(aiLimit)
	}
	ai.POST("/flashcards", func(c *gin.Context) {
		var b usecase.AcademyAiFlashcardsInput
		if !academyBind(c, &b) {
			return
		}
		cards, err := h.uc.AiFlashcards(sid(c), b)
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"flashcards": cards})
	})
	ai.POST("/quiz", func(c *gin.Context) {
		var b usecase.AcademyAiQuizInput
		if !academyBind(c, &b) {
			return
		}
		q, err := h.uc.AiQuiz(sid(c), b)
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"quiz": q})
	})
	ai.POST("/tutor", func(c *gin.Context) {
		var b usecase.AcademyTutorInput
		if !academyBind(c, &b) {
			return
		}
		reply, err := h.uc.AiTutor(sid(c), b)
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"reply": reply})
	})

	/* -------------------------------- admin -------------------------------- */
	ad := rg.Group("/admin")
	if adminMw != nil {
		ad.Use(adminMw)
	}
	ad.GET("/tree", func(c *gin.Context) {
		t, err := h.uc.AdminTree(c.Query("level_id"), c.Query("stream_id"))
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, t)
	})
	ad.GET("/modules/:id", func(c *gin.Context) {
		d, err := h.uc.AdminGetModule(c.Param("id"))
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, d)
	})
	ad.POST("/modules", func(c *gin.Context) {
		raw, ok := academyBody(c)
		if !ok {
			return
		}
		m, err := h.uc.AdminCreateModule(raw)
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(201, gin.H{"module": m})
	})
	ad.PUT("/modules/:id", func(c *gin.Context) {
		raw, ok := academyBody(c)
		if !ok {
			return
		}
		m, err := h.uc.AdminUpdateModule(c.Param("id"), raw)
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"module": m})
	})
	ad.DELETE("/modules/:id", func(c *gin.Context) {
		if err := h.uc.AdminDeleteModule(c.Param("id")); err != nil {
			academyFail(c, err)
			return
		}
		c.Status(204)
	})
	ad.POST("/modules/:id/duplicate", func(c *gin.Context) {
		m, err := h.uc.AdminDuplicateModule(c.Param("id"))
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(201, gin.H{"module": m})
	})
	ad.PATCH("/modules/:id/access", func(c *gin.Context) {
		var b usecase.AcademyAccessPatch
		if !academyBind(c, &b) {
			return
		}
		m, err := h.uc.AdminSetAccess(c.Param("id"), b)
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"module": m})
	})
	ad.PATCH("/modules/:id/status", func(c *gin.Context) {
		var b struct {
			PublishStatus string `json:"publish_status"`
		}
		if !academyBind(c, &b) {
			return
		}
		m, err := h.uc.AdminSetStatus(c.Param("id"), b.PublishStatus)
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"module": m})
	})
	ad.POST("/modules/:id/reorder", func(c *gin.Context) {
		var b struct {
			Direction string `json:"direction"`
		}
		if !academyBind(c, &b) {
			return
		}
		if err := h.uc.AdminReorderModule(c.Param("id"), b.Direction); err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"message": "success"})
	})
	ad.POST("/chapters", func(c *gin.Context) {
		var b struct {
			SubjectID   string `json:"subject_id"`
			Title       string `json:"title"`
			Description string `json:"description"`
			IsPremium   bool   `json:"is_premium"`
		}
		if !academyBind(c, &b) {
			return
		}
		ch, err := h.uc.AdminCreateChapter(b.SubjectID, b.Title, b.Description, b.IsPremium)
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(201, gin.H{"chapter": ch})
	})
	ad.PUT("/chapters/:id", func(c *gin.Context) {
		var b usecase.AcademyChapterPatch
		if !academyBind(c, &b) {
			return
		}
		ch, err := h.uc.AdminUpdateChapter(c.Param("id"), b)
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"chapter": ch})
	})
	ad.DELETE("/chapters/:id", func(c *gin.Context) {
		if err := h.uc.AdminDeleteChapter(c.Param("id")); err != nil {
			academyFail(c, err)
			return
		}
		c.Status(204)
	})
	ad.POST("/chapters/:id/reorder", func(c *gin.Context) {
		var b struct {
			Direction string `json:"direction"`
		}
		if !academyBind(c, &b) {
			return
		}
		if err := h.uc.AdminReorderChapter(c.Param("id"), b.Direction); err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"message": "success"})
	})
	ad.POST("/subjects", func(c *gin.Context) {
		var b domainSubjectInput
		if !academyBind(c, &b) {
			return
		}
		s, err := h.uc.AdminCreateSubject(b.toDomain())
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(201, gin.H{"subject": s})
	})
	ad.PATCH("/programs/:id", func(c *gin.Context) {
		var b struct {
			IsActive *bool `json:"is_active"`
		}
		if !academyBind(c, &b) || b.IsActive == nil {
			if b.IsActive == nil {
				c.JSON(400, gin.H{"error": "is_active is required"})
			}
			return
		}
		p, err := h.uc.AdminSetProgramActive(c.Param("id"), *b.IsActive)
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"program": p})
	})

	adAI := ad.Group("/ai")
	if aiLimit != nil {
		adAI.Use(aiLimit)
	}
	adAI.POST("/generate", func(c *gin.Context) {
		var b usecase.AcademyGenerateDraftsInput
		if !academyBind(c, &b) {
			return
		}
		drafts, err := h.uc.AdminGenerateDrafts(b)
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(201, gin.H{"drafts": drafts})
	})
	ad.GET("/ai-drafts", func(c *gin.Context) {
		list, err := h.uc.AdminListDrafts(c.Query("module_id"))
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"drafts": list})
	})
	ad.PATCH("/ai-drafts/:id", func(c *gin.Context) {
		var b usecase.AcademyDraftPatch
		if !academyBind(c, &b) {
			return
		}
		d, err := h.uc.AdminUpdateDraft(c.Param("id"), b)
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"draft": d})
	})
	ad.DELETE("/ai-drafts/:id", func(c *gin.Context) {
		if err := h.uc.AdminDeleteDraft(c.Param("id")); err != nil {
			academyFail(c, err)
			return
		}
		c.Status(204)
	})
	ad.GET("/analytics", func(c *gin.Context) {
		a, err := h.uc.AdminAnalytics()
		if err != nil {
			academyFail(c, err)
			return
		}
		c.JSON(200, gin.H{"analytics": a})
	})
}

// domainSubjectInput is the admin "create subject" payload (server owns id and counters).
type domainSubjectInput struct {
	Name        string `json:"name"`
	Code        string `json:"code"`
	LevelID     string `json:"level_id"`
	StreamID    string `json:"stream_id"`
	Description string `json:"description"`
	IconName    string `json:"icon_name"`
	ColorTheme  string `json:"color_theme"`
}

func (b domainSubjectInput) toDomain() domain.AcademySubject {
	return domain.AcademySubject{
		Name: b.Name, Code: b.Code, LevelID: b.LevelID, StreamID: b.StreamID,
		Description: b.Description, IconName: b.IconName, ColorTheme: b.ColorTheme,
	}
}
