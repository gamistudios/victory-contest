package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"victory-contest-go/internal/usecase"
)

// TestParseDocumentAsyncFlow pins the job protocol: the POST answers 202
// immediately with a job id, the status endpoint moves processing → done,
// and the done payload carries the questions (and empty image manifest).
func TestParseDocumentAsyncFlow(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewQuestionHandler(nil, nil, nil)
	api := r.Group("/api/question")
	h.RegisterRoutes(api)

	const bank = "Subject: Chemistry\nGrade: 9\nQ1. What is the atomic number of carbon?\nA. 4\nB. 6\nAnswer: 2\n"

	// Unknown job ids 404 before anything is started.
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/question/parse-document/deadbeef", nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("unknown job status = %d, want 404", w.Code)
	}

	// Binary garbage must be rejected synchronously by the extraction step.
	w = httptest.NewRecorder()
	req := uploadParseRequest("text", "garbage.txt", "\x00\x01\x02\xff\xfe binary junk")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("garbage upload status = %d, want 400 (sync rejection), body %s", w.Code, w.Body.String())
	}

	// A valid text bank starts a job that completes with the questions.
	w = httptest.NewRecorder()
	r.ServeHTTP(w, uploadParseRequest("text", "bank.txt", bank))
	if w.Code != http.StatusAccepted {
		t.Fatalf("upload status = %d, want 202, body %s", w.Code, w.Body.String())
	}
	jobID := decodeJobID(t, w.Body.String())

	var questions []int
	deadline := time.Now().Add(3 * time.Second)
	for {
		w = httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/question/parse-document/"+jobID, nil))
		// 200 when done, 202 while still processing.
		if w.Code != http.StatusOK && w.Code != http.StatusAccepted {
			t.Fatalf("poll status = %d, body %s", w.Code, w.Body.String())
		}
		status := decodeJobStatus(t, w.Body.String())
		switch status.Status {
		case usecase.ParseJobDone:
			if len(status.Questions) != 1 {
				t.Fatalf("done payload questions = %v", questions)
			}
			if status.Questions[0].Answer != 2 {
				t.Fatalf("q1 answer = %v", status.Questions[0].Answer)
			}
			return
		case usecase.ParseJobProcessing:
			if time.Now().After(deadline) {
				t.Fatal("job never completed within 3s")
			}
			time.Sleep(20 * time.Millisecond)
		default:
			t.Fatalf("unexpected job status %q: %s", status.Status, status.Error)
		}
	}
}

// TestParseDocumentAINotConfigured: mode=ai without a wired provider fails
// fast with a 400 instead of starting a doomed job.
func TestParseDocumentAINotConfigured(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	NewQuestionHandler(nil, nil, nil).RegisterRoutes(r.Group("/api/question"))

	w := httptest.NewRecorder()
	r.ServeHTTP(w, uploadParseRequest("ai", "bank.txt", "1. q?\na. x\nb. y\nAnswer: 1"))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400, body %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "AI parsing is not configured") {
		t.Fatalf("unexpected body: %s", w.Body.String())
	}
}

func uploadParseRequest(mode, filename, content string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, "/api/question/parse-document",
		strings.NewReader(multipartBody(mode, filename, content)))
	req.Header.Set("Content-Type", "multipart/form-data; boundary=testboundary")
	return req
}

// multipartBody builds a minimal multipart/form-data body.
func multipartBody(mode, filename, content string) string {
	var b strings.Builder
	b.WriteString("--testboundary\r\n")
	b.WriteString("Content-Disposition: form-data; name=\"mode\"\r\n\r\n")
	b.WriteString(mode + "\r\n")
	b.WriteString("--testboundary\r\n")
	b.WriteString("Content-Disposition: form-data; name=\"file\"; filename=\"" + filename + "\"\r\n")
	b.WriteString("Content-Type: text/plain\r\n\r\n")
	b.WriteString(content + "\r\n")
	b.WriteString("--testboundary--\r\n")
	return b.String()
}

func decodeJobID(t *testing.T, body string) string {
	t.Helper()
	i := strings.Index(body, "\"job_id\":\"")
	if i < 0 {
		t.Fatalf("no job_id in %s", body)
	}
	rest := body[i+len("\"job_id\":\""):]
	return rest[:strings.Index(rest, "\"")]
}

func decodeJobStatus(t *testing.T, body string) usecase.ParseJobStatus {
	t.Helper()
	var status usecase.ParseJobStatus
	if err := json.Unmarshal([]byte(body), &status); err != nil {
		t.Fatalf("decode status body %s: %v", body, err)
	}
	return status
}
