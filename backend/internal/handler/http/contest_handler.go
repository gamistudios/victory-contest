package http

import (
	"fmt"
	"net/http"
	"reflect"
	"strings"
	"time"
	"victor-contest-go/internal/domain"
	"victor-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

type ContestHandler struct {
	usecase             usecase.ContestUsecase
	notificationService usecase.NotificationUsecase
}

func NewContestHandler(u usecase.ContestUsecase, notificationService usecase.NotificationUsecase) *ContestHandler {
	return &ContestHandler{
		usecase:             u,
		notificationService: notificationService,
	}
}

func (h *ContestHandler) RegisterRoutes(rg *gin.RouterGroup) {
	rg.POST("/add", h.AddContest)
	rg.PATCH("/:id", h.UpdateContest)
	rg.GET("/", h.GetAllContests)
	rg.GET("/:id", h.GetContestByID)
	rg.DELETE("/delete/:id", h.DeleteContest)
	rg.POST("/clone/:id", h.CloneContest)
	rg.POST("/announce/:id", h.AnnounceContest)
}

func (h *ContestHandler) AddContest(c *gin.Context) {
	var contest domain.Contest
	if err := c.ShouldBindJSON(&contest); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id, err := h.usecase.AddContest(contest)
	if err != nil {
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
	if !providedAnyUpdate {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No valid fields provided for update"})
		return
	}

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

	// Perform the update
	err = h.usecase.UpdateContest(id, update)
	if err != nil {
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
	c.JSON(http.StatusOK, gin.H{"contests": contests})
}

func (h *ContestHandler) GetContestByID(c *gin.Context) {
	id := c.Param("id")
	contest, err := h.usecase.GetContestByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"contest": contest})
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
		recepientId := "all"
		Type := "contest_announcement"
		if err := h.notificationService.SendNotification(title, message, Type, recepientId); err != nil {
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
