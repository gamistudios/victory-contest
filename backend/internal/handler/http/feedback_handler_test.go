package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// fakeFeedbackResponseUsecase only implements AddFeedbackResponse.
type fakeFeedbackResponseUsecase struct {
	usecase.FeedbackResponseUsecase
}

func (f *fakeFeedbackResponseUsecase) AddFeedbackResponse(response domain.FeedbackResponse) (string, error) {
	return "resp-1", nil
}

// TestAddFeedbackResponseNotifiesAdmins covers the second half of #28: the
// "new feedback response" notification must go to the admin audience, not to
// the student who submitted it.
func TestAddFeedbackResponseNotifiesAdmins(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := newTestRouter()
	notif := &fakeNotificationUsecase{sent: make(chan sentNotification, 8)}
	NewFeedbackResponseHandler(&fakeFeedbackResponseUsecase{}, notif).RegisterRoutes(r.Group("/api/feedback-response"))

	body, err := json.Marshal(domain.FeedbackResponse{
		StudentID:   "student-99",
		StudentName: "Ada",
	})
	if err != nil {
		t.Fatalf("marshal response: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/feedback-response/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}

	select {
	case n := <-notif.sent:
		if n.RecipientID == "student-99" {
			t.Fatalf("feedback-response notification still addressed to the submitting student: %+v", n)
		}
		if n.RecipientID != "admin" || n.Type != "feedback_response" {
			t.Fatalf("unexpected notification: %+v", n)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no feedback_response notification was sent")
	}
}
