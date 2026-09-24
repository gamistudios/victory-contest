package http

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/gin-gonic/gin"
)

// fakeContestUsecase records the domain.Contest handed to UpdateContest so the
// PATCH handler's merge/validation behaviour (#27) can be asserted without a
// database.
type fakeContestUsecase struct {
	usecase.ContestUsecase

	current *domain.ContestTypeWithQuestionObj
	updated domain.Contest
	updates int
}

func (f *fakeContestUsecase) GetContestByID(id string) (*domain.ContestTypeWithQuestionObj, error) {
	if f.current == nil || f.current.ID != id {
		return nil, nil
	}
	return f.current, nil
}

func (f *fakeContestUsecase) UpdateContest(id string, update domain.Contest) error {
	f.updated = update
	f.updates++
	return nil
}

// announceRecord captures what announce actually pushed to students (#39).
type announceRecord struct {
	Title, Message, Type, Recipient string
}

type fakeAnnounceNotifier struct {
	usecase.NotificationUsecase

	sent    []announceRecord
	sendErr error
}

func (f *fakeAnnounceNotifier) SendNotification(title, message, Type, recipientID string) error {
	if f.sendErr != nil {
		return f.sendErr
	}
	f.sent = append(f.sent, announceRecord{title, message, Type, recipientID})
	return nil
}

func currentContest() *domain.ContestTypeWithQuestionObj {
	obj := &domain.ContestTypeWithQuestionObj{}
	obj.Contest = domain.Contest{
		ID:        "c1",
		Title:     "Old title",
		Grade:     "5",
		Questions: []string{"old-1", "old-2"},
	}
	obj.Questions = nil
	return obj
}

func contestTestRouter(h *ContestHandler) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h.RegisterRoutes(r.Group("/api/contest"))
	return r
}

func patchContest(t *testing.T, uc *fakeContestUsecase, body string) *httptest.ResponseRecorder {
	t.Helper()
	r := contestTestRouter(NewContestHandler(uc, &fakeAnnounceNotifier{}))
	req := httptest.NewRequest(http.MethodPatch, "/api/contest/c1", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// TestPatchAppliesNewQuestionsList covers #27: a valid new list must reach the
// usecase instead of being silently discarded.
func TestPatchAppliesNewQuestionsList(t *testing.T) {
	uc := &fakeContestUsecase{current: currentContest()}
	w := patchContest(t, uc, `{"questions":["q-b","q-a","q-b"]}`)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	want := []string{"q-b", "q-a", "q-b"}
	if len(uc.updated.Questions) != len(want) {
		t.Fatalf("questions = %v, want %v (order and duplicates preserved)", uc.updated.Questions, want)
	}
	for i := range want {
		if uc.updated.Questions[i] != want[i] {
			t.Fatalf("questions = %v, want %v", uc.updated.Questions, want)
		}
	}
	// Untouched scalar fields keep their stored values.
	if uc.updated.Title != "Old title" || uc.updated.Grade != "5" {
		t.Fatalf("non-provided fields were not preserved: %+v", uc.updated)
	}
}

// TestPatchRejectsNonStringQuestions documents the other half of #27: garbage in
// the list is a client error, never a silent no-op.
func TestPatchRejectsNonStringQuestions(t *testing.T) {
	cases := []string{
		`{"questions":[1,"ok"]}`,
		`{"questions":["ok",null]}`,
		`{"questions":["ok",{"a":1}]}`,
		`{"questions":"q1"}`,
		`{"questions":["ok","  "]}`,
		`{"questions":123}`,
	}
	for _, body := range cases {
		uc := &fakeContestUsecase{current: currentContest()}
		w := patchContest(t, uc, body)
		if w.Code != http.StatusBadRequest {
			t.Errorf("body %s: status = %d, want 400 (%s)", body, w.Code, w.Body.String())
		}
		if uc.updates != 0 {
			t.Errorf("body %s: usecase was called despite the 400", body)
		}
	}
}

// TestPatchRejectsNonStringScalarFields covers #27: {"title":42} must be a 400.
func TestPatchRejectsNonStringScalarFields(t *testing.T) {
	for _, body := range []string{`{"title":42}`, `{"status":["a"]}`, `{"grade":{"x":1}}`} {
		uc := &fakeContestUsecase{current: currentContest()}
		w := patchContest(t, uc, body)
		if w.Code != http.StatusBadRequest {
			t.Errorf("body %s: status = %d, want 400", body, w.Code)
		}
		if uc.updates != 0 {
			t.Errorf("body %s: usecase was called despite the 400", body)
		}
	}
}

// TestPatchEmptyQuestionsDoesNotClear keeps the pre-existing safety: an empty
// list is not a deletion.
func TestPatchEmptyQuestionsDoesNotClear(t *testing.T) {
	uc := &fakeContestUsecase{current: currentContest()}
	w := patchContest(t, uc, `{"title":"New","questions":[]}`)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if len(uc.updated.Questions) != 2 {
		t.Fatalf("questions = %v, want the stored list kept", uc.updated.Questions)
	}
}

// TestAnnounceUsesRequestMessage covers #39: the posted message has to end up in
// the notification the announce flow sends.
func TestAnnounceUsesRequestMessage(t *testing.T) {
	uc := &fakeContestUsecase{current: currentContest()}
	notif := &fakeAnnounceNotifier{}

	r := contestTestRouter(NewContestHandler(uc, notif))

	req := httptest.NewRequest(http.MethodPost, "/api/contest/announce/c1", bytes.NewBufferString(`{"message":"Doors open at 9:00"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if len(notif.sent) != 1 {
		t.Fatalf("notifications sent = %d, want 1", len(notif.sent))
	}
	got := notif.sent[0]
	if got.Message == "" || got.Message == fmt.Sprintf("New contest is announce for grade %s", "5") {
		t.Fatalf("notification message does not carry the request message: %q", got.Message)
	}
	if want := "Doors open at 9:00"; !bytes.Contains([]byte(got.Message), []byte(want)) {
		t.Fatalf("notification message %q does not contain %q", got.Message, want)
	}
	if got.Type != "contest_announcement" || got.Recipient != "all" {
		t.Fatalf("unexpected notification routing: %+v", got)
	}
	// The response still echoes the announcement payload.
	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	ann, _ := resp["announcement"].(map[string]any)
	if ann["message"] != "Doors open at 9:00" {
		t.Fatalf("response announcement = %v", resp["announcement"])
	}
}

func TestAnnounceRejectsEmptyMessage(t *testing.T) {
	notif := &fakeAnnounceNotifier{}
	r := contestTestRouter(NewContestHandler(&fakeContestUsecase{current: currentContest()}, notif))

	for _, body := range []string{`{"message":""}`, `{"message":"   "}`, `{}`} {
		req := httptest.NewRequest(http.MethodPost, "/api/contest/announce/c1", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("body %s: status = %d, want 400", body, w.Code)
		}
	}
	if len(notif.sent) != 0 {
		t.Fatalf("no notification may be sent for invalid payloads, got %+v", notif.sent)
	}
}

// TestQuestionsAttributeIsAlwaysAList guards the #42 marshalling contract at the
// value level: the domain marshals to L, and both L and legacy SS decode back.
func TestQuestionsAttributeIsAlwaysAList(t *testing.T) {
	contests := domain.Contest{ID: "c1", Questions: []string{"q1", "q1", "q2"}}
	item, err := attributevalue.MarshalMap(contests)
	if err != nil {
		t.Fatalf("MarshalMap: %v", err)
	}
	if _, ok := item["questions"].(*types.AttributeValueMemberL); !ok {
		t.Fatalf("insert path wrote %T, want *types.AttributeValueMemberL", item["questions"])
	}

	// Readers must tolerate rows the old update path stored as a string set.
	var fromSet domain.Contest
	if err := attributevalue.UnmarshalMap(map[string]types.AttributeValue{
		"id":        &types.AttributeValueMemberS{Value: "c1"},
		"questions": &types.AttributeValueMemberSS{Value: []string{"legacy-1", "legacy-2"}},
	}, &fromSet); err != nil {
		t.Fatalf("unmarshal legacy SS row: %v", err)
	}
	if len(fromSet.Questions) != 2 {
		t.Fatalf("legacy SS row decoded to %v", fromSet.Questions)
	}
}
