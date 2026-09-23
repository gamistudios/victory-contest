package http

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"victor-contest-go/internal/domain"
	"victor-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// --- student-facing contest read: answer stripping (README §9 #11) ------

func contestWithQuestions(endTime string) *domain.ContestTypeWithQuestionObj {
	obj := &domain.ContestTypeWithQuestionObj{}
	obj.Contest = domain.Contest{ID: "c1", Title: "Live test", EndTime: endTime}
	obj.Questions = []domain.Question{
		{ID: "q1", QuestionText: "2+2?", Answer: 2, Explanation: "because math",
			ExplanationImg: "http://x/exp.png", MultipleChoice: []string{"3", "4"}},
	}
	return obj
}

func getContestJSON(t *testing.T, endTime string) map[string]any {
	t.Helper()
	r := contestTestRouter(NewContestHandler(&fakeContestUsecase{current: contestWithQuestions(endTime)}, &fakeAnnounceNotifier{}))
	req := httptest.NewRequest(http.MethodGet, "/api/contest/c1", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v (%s)", err, w.Body.String())
	}
	return body
}

func firstQuestion(t *testing.T, body map[string]any) map[string]any {
	t.Helper()
	contests, _ := body["contest"].(map[string]any)
	qs, _ := contests["questions"].([]any)
	if len(qs) != 1 {
		t.Fatalf("expected 1 hydrated question, got %v", contests["questions"])
	}
	return qs[0].(map[string]any)
}

func TestGetContestByID_LiveStripsAnswers(t *testing.T) {
	q := firstQuestion(t, getContestJSON(t, time.Now().Add(time.Hour).Format(time.RFC3339)))
	for _, leak := range []string{"answer", "explanation", "explanation_image"} {
		if _, ok := q[leak]; ok {
			t.Fatalf("live contest leaked %q: %v", leak, q)
		}
	}
	// The exam UI itself must still work.
	if q["question_text"] != "2+2?" {
		t.Fatalf("question_text missing: %v", q)
	}
	if mc, ok := q["multiple_choice"].([]any); !ok || len(mc) != 2 {
		t.Fatalf("multiple_choice broken: %v", q["multiple_choice"])
	}
	if q["id"] != "q1" {
		t.Fatalf("question id missing: %v", q)
	}
}

func TestGetContestByID_UnsetEndTimeFailsClosed(t *testing.T) {
	// Unset/garbage end_time counts as live: the exam page auto-submits on a
	// missing end_time, and a live view must never gamble on answers.
	for _, endTime := range []string{"", "not-a-date", " "} {
		q := firstQuestion(t, getContestJSON(t, endTime))
		if _, ok := q["answer"]; ok {
			t.Fatalf("end_time %q leaked answers: %v", endTime, q)
		}
	}
}

func TestGetContestByID_EndedKeepsAnswers(t *testing.T) {
	q := firstQuestion(t, getContestJSON(t, time.Now().Add(-time.Hour).Format(time.RFC3339)))
	if a, ok := q["answer"]; !ok || a != float64(2) {
		t.Fatalf("ended contest should expose the answer for review, got %v (present=%v)", q["answer"], ok)
	}
	if q["explanation"] != "because math" {
		t.Fatalf("ended contest should expose explanations, got %v", q["explanation"])
	}
}

// --- submission response contract (README §9 #12) ------------------------

type fakeSubmissionUsecase struct {
	usecase.SubmissionUsecase

	id      string
	score   float64
	err     error
	gotBind domain.SubmissionDto
}

func (f *fakeSubmissionUsecase) AddSubmission(dto domain.SubmissionDto) (string, float64, error) {
	f.gotBind = dto
	return f.id, f.score, f.err
}

func postSubmission(t *testing.T, uc *fakeSubmissionUsecase, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	NewSubmissionHandler(uc).RegisterRoutes(r.Group("/api/submission"))
	req := httptest.NewRequest(http.MethodPost, "/api/submission/", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestAddSubmissionResponse_CarriesOfficialScore(t *testing.T) {
	uc := &fakeSubmissionUsecase{id: "sub-1", score: 7}
	w := postSubmission(t, uc, `{"contest_id":"c1","score":100}`)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["id"] != "sub-1" || body["score"] != float64(7) {
		t.Fatalf("body = %v, want the server-granted score", body)
	}
}

func TestAddSubmissionErrorMapping(t *testing.T) {
	cases := []struct {
		err  error
		want int
	}{
		{usecase.ErrContestNotFound, http.StatusNotFound},
		{usecase.ErrContestHasNoQuestions, http.StatusBadRequest},
		{usecase.ErrNoStudentID, http.StatusBadRequest},
		{errors.New("boom"), http.StatusInternalServerError},
	}
	for _, c := range cases {
		uc := &fakeSubmissionUsecase{err: c.err}
		w := postSubmission(t, uc, `{"contest_id":"c1"}`)
		if w.Code != c.want {
			t.Errorf("err %v: status = %d, want %d", c.err, w.Code, c.want)
		}
	}
}
