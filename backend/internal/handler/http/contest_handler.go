package http

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"reflect"
	"strings"
	"time"
	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

type ContestHandler struct {
	usecase             usecase.ContestUsecase
	notificationService usecase.NotificationUsecase
	pricing             *usecase.PricingUsecase // optional: premium gate (D2)
	jwtSecret           []byte
	// scopeCheck validates a contest Scope against the catalog (wired by NewRouter; nil in tests).
	scopeCheck func(domain.Scope) error
}

// premiumContest: contests have no Scope yet (Phase 2), so the interim gate
// keys off the contest type.
func premiumContest(ctype string) bool {
	t := strings.ToLower(strings.TrimSpace(ctype))
	return t == "premium" || t == "paid"
}

// denyPremium enforces D2 on the server. Admins (admin cookie) always pass;
// students need a valid session AND a live (or in-grace) entitlement.
// Returns true when it wrote the response.
func (h *ContestHandler) denyPremium(c *gin.Context, ctype string, scope *domain.Scope) bool {
	if h.pricing == nil || !premiumContest(ctype) {
		return false
	}
	if tok, err := c.Cookie("token"); err == nil && tok != "" {
		if claims, ok := parseJWTClaims(tok, h.jwtSecret); ok && claims.Role == "" {
			return false
		}
	}
	tok := studentSessionToken(c)
	claims, ok := parseJWTClaims(tok, h.jwtSecret)
	if tok == "" || !ok || claims.Role != StudentRole {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return true
	}
	if !h.studentLocked(claims.UserID, ctype, scope) {
		return false
	}
	pid := ""
	if scope != nil {
		pid = scope.ProgramID
	}
	c.JSON(http.StatusPaymentRequired, gin.H{"error": "premium content", "lock": usecase.LockFor(usecase.LockedPremium, pid)})
	return true
}

// studentLocked applies the single access function (usecase.Decide) when the
// contest carries a Scope; contests without one fall back to "any active
// entitlement" (legacy contests created before scopes existed).
func (h *ContestHandler) studentLocked(studentID, ctype string, scope *domain.Scope) bool {
	if !premiumContest(ctype) {
		return false
	}
	if scope == nil || scope.ProgramID == "" {
		return !h.pricing.HasAnyAccess(studentID)
	}
	acc, err := h.pricing.AccessFor(studentID, false)
	if err != nil {
		return true // fail closed
	}
	d := usecase.Decide(acc, usecase.Resource{Scope: *scope, Access: "premium", Published: true}, time.Now(), domain.DefaultGraceDays)
	return d != usecase.Allowed
}

func NewContestHandler(u usecase.ContestUsecase, notificationService usecase.NotificationUsecase) *ContestHandler {
	return &ContestHandler{
		usecase:             u,
		notificationService: notificationService,
	}
}

func (h *ContestHandler) RegisterRoutes(rg *gin.RouterGroup, adminAuth ...gin.HandlerFunc) {
	// Students may browse contests; every mutation (and the announce blast)
	// is admin-only.
	auth := rg.Group("", adminAuth...)
	auth.POST("/add", h.AddContest)
	auth.PATCH("/:id", h.UpdateContest)
	auth.DELETE("/delete/:id", h.DeleteContest)
	auth.POST("/clone/:id", h.CloneContest)
	auth.POST("/announce/:id", h.AnnounceContest)
	rg.GET("/", h.GetAllContests)
	rg.GET("/:id", h.GetContestByID)
}

func (h *ContestHandler) AddContest(c *gin.Context) {
	var contest domain.Contest
	if err := c.ShouldBindJSON(&contest); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if contest.Scope != nil && h.scopeCheck != nil {
		if err := h.scopeCheck(*contest.Scope); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	id, err := h.usecase.AddContest(contest)
	if err != nil {
		if errors.Is(err, usecase.ErrInvalidContest) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id})
}

func (h *ContestHandler) UpdateContest(c *gin.Context) {
	id := c.Param("id")

	// Parse the raw JSON to handle partial updates
	var rawData map[string]interface{}
	if err := c.ShouldBindJSON(&rawData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON format: " + err.Error()})
		return
	}

	// Get the current contest to merge with updates
	currentContest, err := h.usecase.GetContestByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get current contest: " + err.Error()})
		return
	}
	if currentContest == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Contest not found"})
		return
	}

	// Create update struct with only the fields that are provided
	update := domain.Contest{
		ID: id, // Always set the ID
	}

	// Define allowed fields for update
	allowedFields := map[string]string{
		"title":       "Title",
		"description": "Description",
		"start_time":  "StartTime",
		"end_time":    "EndTime",
		"subject":     "Subject",
		"grade":       "Grade",
		"prize":       "Prize",
		"status":      "Status",
		"type":        "Type",
	}

	// Process only the fields that are provided in the update. Anything that is
	// not a string is a client error (#27) -- it used to be dropped silently, so
	// {"title": 42} answered 200 while changing nothing.
	providedAnyUpdate := false
	for jsonField, structField := range allowedFields {
		value, exists := rawData[jsonField]
		if !exists || value == nil {
			continue
		}
		strValue, ok := value.(string)
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Field %q must be a string", jsonField)})
			return
		}
		if strValue == "" {
			// Empty string keeps the partial-update semantics: leave unchanged.
			continue
		}
		// Use reflection to set the field value
		reflect.ValueOf(&update).Elem().FieldByName(structField).SetString(strValue)
		providedAnyUpdate = true
	}

	// Questions are updatable too (#27): a provided, valid list replaces the
	// stored one; anything malformed is rejected instead of being ignored.
	var newQuestions []string
	questionsProvided := false
	if rawQuestions, exists := rawData["questions"]; exists && rawQuestions != nil {
		parsed, err := parseQuestionsUpdate(rawQuestions)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		questionsProvided = true
		newQuestions = parsed
		if len(newQuestions) > 0 {
			providedAnyUpdate = true
		}
	}

	// Validate that at least one field was updated
	_ = providedAnyUpdate // re-evaluated after the typed Phase 2 patch below

	// Preserve existing fields that weren't updated
	if update.Title == "" {
		update.Title = currentContest.Contest.Title
	}
	if update.Description == "" {
		update.Description = currentContest.Contest.Description
	}
	if update.StartTime == "" {
		update.StartTime = currentContest.Contest.StartTime
	}
	if update.EndTime == "" {
		update.EndTime = currentContest.Contest.EndTime
	}
	if update.Subject == "" {
		update.Subject = currentContest.Contest.Subject
	}
	if update.Grade == "" {
		update.Grade = currentContest.Contest.Grade
	}
	if update.Prize == "" {
		update.Prize = currentContest.Contest.Prize
	}
	if update.Status == "" {
		update.Status = currentContest.Contest.Status
	}
	if update.Type == "" {
		update.Type = currentContest.Contest.Type
	}

	// Phase 2 (D11): carry the stored Scope/Phase 2 fields over (a full-row
	// update would otherwise drop them), then apply the typed patch.
	cur := currentContest.Contest
	update.Scope, update.Kind, update.Mode = cur.Scope, cur.Kind, cur.Mode
	update.DurationMinutes, update.LatePenaltyPercent, update.Reveal = cur.DurationMinutes, cur.LatePenaltyPercent, cur.Reveal
	update.ShuffleQuestions, update.ShuffleOptions, update.Year, update.Source = cur.ShuffleQuestions, cur.ShuffleOptions, cur.Year, cur.Source
	var patch domain.ContestPatch
	if raw, mErr := json.Marshal(rawData); mErr == nil {
		if uErr := json.Unmarshal(raw, &patch); uErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid assessment field: " + uErr.Error()})
			return
		}
	}
	if patch.Apply(&update) {
		providedAnyUpdate = true
		if update.Scope != nil && patch.Scope != nil {
			if h.scopeCheck != nil {
				if vErr := h.scopeCheck(*update.Scope); vErr != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": vErr.Error()})
					return
				}
			} else if update.Scope.ProgramID == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "scope.program_id is required"})
				return
			}
		}
		if update.Mode != "" {
			if vErr := usecase.ValidateContestPhase2(&update); vErr != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": vErr.Error()})
				return
			}
		}
	}

	// Preserve questions unless the caller sent a valid replacement list.
	update.Questions = currentContest.Contest.Questions
	if questionsProvided && len(newQuestions) > 0 {
		update.Questions = newQuestions
	}

	// Additional safety check: ensure questions are never emptied if they existed
	// before (an explicit [] is treated as "no change", not "clear").
	if len(currentContest.Contest.Questions) > 0 && len(update.Questions) == 0 {
		update.Questions = currentContest.Contest.Questions
	}

	// Times became real timestamps (#50): when a PATCH touches either one,
	// the EFFECTIVE pair (provided value or stored value) must parse and be
	// ordered. A contest whose stored legacy time is garbage is not blocked
	// from unrelated patches — only from touching the time fields.
	_, startProvided := rawData["start_time"]
	_, endProvided := rawData["end_time"]
	if (startProvided || endProvided) && (update.StartTime != "" || update.EndTime != "") {
		if err := usecase.ValidateContestTimes(update.StartTime, update.EndTime); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	if !providedAnyUpdate {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No valid fields provided for update"})
		return
	}

	// Perform the update
	err = h.usecase.UpdateContest(id, update)
	if err != nil {
		if errors.Is(err, usecase.ErrInvalidContest) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update contest: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Contest updated successfully"})
}

// parseQuestionsUpdate validates the optional "questions" value of a PATCH
// body (#27). Every entry has to be a non-empty string (question ids), so
// payloads such as [1, "ok"], {"a":1} or an array holding nulls fail with 400
// instead of being dropped on the floor.
func parseQuestionsUpdate(raw interface{}) ([]string, error) {
	questionsArray, ok := raw.([]interface{})
	if !ok {
		return nil, fmt.Errorf(`Field "questions" must be an array of question id strings`)
	}
	questions := make([]string, 0, len(questionsArray))
	for i, entry := range questionsArray {
		value, ok := entry.(string)
		if !ok {
			return nil, fmt.Errorf("questions[%d] must be a string, got %T", i, entry)
		}
		if strings.TrimSpace(value) == "" {
			return nil, fmt.Errorf("questions[%d] must not be empty", i)
		}
		questions = append(questions, value)
	}
	return questions, nil
}

func (h *ContestHandler) GetAllContests(c *gin.Context) {
	contests, err := h.usecase.GetAllContests()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// Student sessions get a per-contest `lock` object (uniform with the
	// academy) so the app can show the paywall instead of failing on open.
	if h.pricing != nil {
		if tok := studentSessionToken(c); tok != "" {
			if claims, ok := parseJWTClaims(tok, h.jwtSecret); ok && claims.Role == StudentRole {
				out := make([]gin.H, 0, len(contests))
				for _, ct := range contests {
					raw, _ := json.Marshal(ct)
					row := gin.H{}
					_ = json.Unmarshal(raw, &row)
					if h.studentLocked(claims.UserID, ct.Type, ct.Scope) {
						pid := ""
						if ct.Scope != nil {
							pid = ct.Scope.ProgramID
						}
						row["lock"] = usecase.LockFor(usecase.LockedPremium, pid)
					}
					out = append(out, row)
				}
				c.JSON(http.StatusOK, gin.H{"contests": out})
				return
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{"contests": contests})
}

func (h *ContestHandler) GetContestByID(c *gin.Context) {
	id := c.Param("id")
	contest, err := h.usecase.GetContestByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// README §9 #11: this endpoint feeds the student exam page and the
	// hydrated questions carry the correct answer/explanation from the
	// question table. While the contest is live (end_time unset, garbage or
	// in the future) we answer with an allowlisted view that omits those
	// fields. Admins keep full access via the admin-gated /api/question
	// routes; internal usecase callers (statistics, scoring, editorial) are
	// untouched because only this HTTP response is sanitized.
	if contest != nil && h.denyPremium(c, contest.Type, contest.Scope) {
		return
	}
	if contest != nil {
		c.JSON(http.StatusOK, gin.H{"contest": publicContestPayload(contest, usecase.ContestHasEnded(contest.EndTime))})
		return
	}
	c.JSON(http.StatusOK, gin.H{"contest": contest})
}

// publicContestPayload renders a contest for the student-facing GET
// /api/contest/:id. When the contest has not ended, embedded questions are
// projected through an allowlist so the correct answer/explanation can never
// leak — stripping is fail-closed, not fail-open. When it has ended, the
// hydrated struct is returned unchanged (results review needs the answers).
func publicContestPayload(contest *domain.ContestTypeWithQuestionObj, ended bool) any {
	if ended {
		return contest
	}
	raw, err := json.Marshal(contest.Contest)
	var out gin.H
	if err == nil {
		err = json.Unmarshal(raw, &out)
	}
	if err != nil {
		// Fall back to a minimal safe payload; never leak by defaulting to
		// the unstripped struct.
		out = gin.H{"id": contest.ID, "title": contest.Title}
	}
	qs := make([]gin.H, 0, len(contest.Questions))
	for _, q := range contest.Questions {
		multipleChoice := q.MultipleChoice
		if multipleChoice == nil {
			multipleChoice = []string{}
		}
		optionImages := q.OptionImages
		if optionImages == nil {
			optionImages = []string{}
		}
		qs = append(qs, gin.H{
			"id":              q.ID,
			"question_text":   q.QuestionText,
			"question_image":  q.QuestionImg,
			"subject":         q.Subject,
			"grade":           q.Grade,
			"chapter":         q.Chapter,
			"multiple_choice": multipleChoice,
			// option_images is safe pre-termination: it is just the URLs of
			// the choice photos, none of which reveals the correct option.
			"option_images": optionImages,
		})
	}
	out["questions"] = qs
	out["question_ids"] = contest.QuestionIDs
	return out
}

func (h *ContestHandler) DeleteContest(c *gin.Context) {
	id := c.Param("id")
	err := h.usecase.DeleteContest(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success"})
}

func (h *ContestHandler) AnnounceContest(c *gin.Context) {
	id := c.Param("id")

	// Parse the announce request data - handle both JSON and form data
	var announceRequest domain.ContestAnnouncementRequest
	// Try to bind JSON first, then form data if JSON fails
	if err := c.ShouldBindJSON(&announceRequest); err != nil {
		// If JSON binding fails, try form data
		if err := c.ShouldBind(&announceRequest); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format. Expected JSON or form data: " + err.Error()})
			return
		}
	}

	// Validate required fields
	if announceRequest.Message == "" || strings.TrimSpace(announceRequest.Message) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message is required for contest announcement and cannot be empty or whitespace"})
		return
	}

	// Get the contest to announce
	contest, err := h.usecase.GetContestByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get contest: " + err.Error()})
		return
	}
	if contest == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Contest not found"})
		return
	}

	// Create announcement data
	announcementData := map[string]interface{}{
		"contest_id":    id,
		"contest_title": contest.Contest.Title,
		"message":       announceRequest.Message,
		"file":          announceRequest.File,
		"announced_at":  time.Now().Format(time.RFC3339),
	}

	// Send notifications to all students. The message the admin posted is the
	// body of that notification (#39): previously the decoded payload was
	// dropped and a generated placeholder was sent instead.
	if h.notificationService != nil {
		message := strings.TrimSpace(announceRequest.Message)
		if contest.Contest.Title != "" {
			message = fmt.Sprintf("%s\n\nContest: %s", message, contest.Contest.Title)
		}
		title := "New contest added"
		recipientId := "all"
		Type := "contest_announcement"
		if err := h.notificationService.SendNotification(title, message, Type, recipientId); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send announcement notification: " + err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message":      "Contest announced successfully",
		"announcement": announcementData,
	})
}

func (h *ContestHandler) CloneContest(c *gin.Context) {
	id := c.Param("id")

	// Parse the clone request data
	var cloneRequest struct {
		Title       string `json:"title"`
		Description string `json:"description"`
	}

	if err := c.ShouldBindJSON(&cloneRequest); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON format: " + err.Error()})
		return
	}

	// Validate required fields
	if cloneRequest.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Title is required for cloned contest"})
		return
	}

	// Clone the contest using the usecase
	clonedContestID, err := h.usecase.CloneContest(id, cloneRequest.Title, cloneRequest.Description)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to clone contest: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":         "Contest cloned successfully",
		"clonedContestId": clonedContestID,
	})
}
