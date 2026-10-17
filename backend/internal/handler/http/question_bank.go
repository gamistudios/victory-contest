package http

import (
	"net/http"
	"strings"

	"victory-contest-go/internal/domain"

	"github.com/gin-gonic/gin"
)

// filterQuestionsByBank applies the Phase 3 bank filters (plan 5.6): q (text/topic/source),
// difficulty, verified=true|false, year, topic.
func filterQuestionsByBank(c *gin.Context, in []domain.Question) []domain.Question {
	q := strings.ToLower(strings.TrimSpace(c.Query("q")))
	diff := strings.TrimSpace(c.Query("difficulty"))
	verified := strings.TrimSpace(c.Query("verified"))
	topic := strings.ToLower(strings.TrimSpace(c.Query("topic")))
	year := strings.TrimSpace(c.Query("year"))
	if q == "" && diff == "" && verified == "" && topic == "" && year == "" {
		return in
	}
	out := make([]domain.Question, 0, len(in))
	for _, x := range in {
		if q != "" && !strings.Contains(strings.ToLower(x.QuestionText+" "+x.Topic+" "+x.Source), q) {
			continue
		}
		if diff != "" && x.Difficulty != diff {
			continue
		}
		if verified == "true" && !x.Verified || verified == "false" && x.Verified {
			continue
		}
		if topic != "" && strings.ToLower(x.Topic) != topic {
			continue
		}
		if year != "" && !(year == itoa(x.Year)) {
			continue
		}
		out = append(out, x)
	}
	return out
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	if neg {
		b = append([]byte{'-'}, b...)
	}
	return string(b)
}

// POST /question/assign-scope {ids: [], scope: {program_id, stream_id, subject_id, chapter_id}}
func (h *QuestionHandler) AssignScope(c *gin.Context) {
	var body struct {
		IDs   []string     `json:"ids"`
		Scope domain.Scope `json:"scope"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.IDs) == 0 || body.Scope.ProgramID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids and scope.program_id are required"})
		return
	}
	if len(body.IDs) > 500 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "at most 500 ids per call"})
		return
	}
	if body.Scope.StreamID == "" {
		body.Scope.StreamID = domain.StreamCommon
	}
	updated, failed := h.usecase.AssignScope(body.IDs, body.Scope)
	c.JSON(http.StatusOK, gin.H{"updated": updated, "failed": failed})
}

// GET /question/:id/usage lists the assessments that include the question.
func (h *QuestionHandler) Usage(c *gin.Context) {
	id := c.Param("id")
	if h.contests == nil {
		c.JSON(http.StatusOK, gin.H{"question_id": id, "count": 0, "contests": []gin.H{}})
		return
	}
	all, err := h.contests.GetAllContests()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	used := []gin.H{}
	for _, ct := range all {
		for _, qid := range ct.Questions {
			if qid == id {
				used = append(used, gin.H{"contest_id": ct.ID, "title": ct.Title})
				break
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{"question_id": id, "count": len(used), "contests": used})
}
