package http

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// fakeQuestionBulkDeleteUsecase embeds the QuestionUsecase interface so it only
// needs to implement DeleteQuestions for the bulk-delete handler tests.
type fakeQuestionBulkDeleteUsecase struct {
	usecase.QuestionUsecase

	deleted []string
	failed  map[string]string
	err     error
	calls   [][]string
}

func (f *fakeQuestionBulkDeleteUsecase) DeleteQuestions(ids []string) (*usecase.BulkDeleteResult, error) {
	f.calls = append(f.calls, ids)
	if f.err != nil {
		return nil, f.err
	}
	deleted := f.deleted
	if deleted == nil {
		deleted = []string{}
	}
	failures := []usecase.BulkDeleteFailure{}
	for id, msg := range f.failed {
		failures = append(failures, usecase.BulkDeleteFailure{ID: id, Error: msg})
	}
	return &usecase.BulkDeleteResult{Deleted: deleted, Failed: failures}, nil
}

func newBulkDeleteRouter(f *fakeQuestionBulkDeleteUsecase) *gin.Engine {
	r := newTestRouter()
	NewQuestionHandler(f, nil, nil).RegisterRoutes(r.Group("/api/question"))
	return r
}

type bulkDeleteResponse struct {
	Deleted []string `json:"deleted"`
	Failed  []struct {
		ID    string `json:"id"`
		Error string `json:"error"`
	} `json:"failed"`
	Error string `json:"error"`
}

func postBulkDelete(t *testing.T, r *gin.Engine, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/question/multiple-delete", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestQuestionBulkDeleteSuccess(t *testing.T) {
	fake := &fakeQuestionBulkDeleteUsecase{
		deleted: []string{"q1", "q2"},
	}
	r := newBulkDeleteRouter(fake)

	w := postBulkDelete(t, r, `{"ids":["q1","q2"]}`)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if len(fake.calls) != 1 || len(fake.calls[0]) != 2 || fake.calls[0][0] != "q1" {
		t.Fatalf("expected one DeleteQuestions([q1 q2]) call, got %v", fake.calls)
	}
	var resp bulkDeleteResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("bad JSON: %v", err)
	}
	if len(resp.Deleted) != 2 || resp.Deleted[0] != "q1" || resp.Deleted[1] != "q2" {
		t.Fatalf("deleted = %v", resp.Deleted)
	}
	if len(resp.Failed) != 0 {
		t.Fatalf("expected empty failed, got %v", resp.Failed)
	}
}

func TestQuestionBulkDeletePartialFailure(t *testing.T) {
	fake := &fakeQuestionBulkDeleteUsecase{
		deleted: []string{"q1"},
		failed:  map[string]string{"q2": "boom"},
	}
	r := newBulkDeleteRouter(fake)

	w := postBulkDelete(t, r, `{"ids":["q1","q2"]}`)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var resp bulkDeleteResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("bad JSON: %v", err)
	}
	if len(resp.Deleted) != 1 || resp.Deleted[0] != "q1" {
		t.Fatalf("deleted = %v", resp.Deleted)
	}
	if len(resp.Failed) != 1 || resp.Failed[0].ID != "q2" || resp.Failed[0].Error != "boom" {
		t.Fatalf("failed = %+v", resp.Failed)
	}
}

func TestQuestionBulkDeleteEmptyOrMissingIDs(t *testing.T) {
	cases := map[string]string{
		"empty array":  `{"ids":[]}`,
		"missing ids":  `{}`,
		"null ids":     `{"ids":null}`,
		"blank string": `{"ids":["  "]}`,
		"invalid json": `{"ids":`,
		"not an array": `{"ids":"q1"}`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			fake := &fakeQuestionBulkDeleteUsecase{}
			r := newBulkDeleteRouter(fake)

			w := postBulkDelete(t, r, body)

			if w.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
			}
			if len(fake.calls) != 0 {
				t.Fatalf("usecase must not be called, got %v", fake.calls)
			}
		})
	}
}

func TestQuestionBulkDeleteNonStringEntries(t *testing.T) {
	fake := &fakeQuestionBulkDeleteUsecase{}
	r := newBulkDeleteRouter(fake)

	w := postBulkDelete(t, r, `{"ids":["q1",123]}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if len(fake.calls) != 0 {
		t.Fatalf("usecase must not be called, got %v", fake.calls)
	}
}

func TestQuestionBulkDeleteOversizedList(t *testing.T) {
	fake := &fakeQuestionBulkDeleteUsecase{}
	r := newBulkDeleteRouter(fake)

	ids := make([]string, 501)
	for i := range ids {
		ids[i] = "id-" + strconv.Itoa(i)
	}
	payload, err := json.Marshal(map[string][]string{"ids": ids})
	if err != nil {
		t.Fatal(err)
	}

	w := postBulkDelete(t, r, string(payload))

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if len(fake.calls) != 0 {
		t.Fatalf("usecase must not be called for oversized list, got %v", fake.calls)
	}
}

func TestQuestionBulkDeleteUsecaseError(t *testing.T) {
	fake := &fakeQuestionBulkDeleteUsecase{err: errors.New("dynamodb down")}
	r := newBulkDeleteRouter(fake)

	w := postBulkDelete(t, r, `{"ids":["q1"]}`)

	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
}
