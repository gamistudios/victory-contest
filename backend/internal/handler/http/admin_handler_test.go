package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"victor-contest-go/internal/domain"
	"victor-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// fakeAdminUsecase embeds the AdminUsecase interface and records which lookup
// the GET /api/admin/:id route actually performs (#22).
type fakeAdminUsecase struct {
	usecase.AdminUsecase

	adminsByID  map[string]*domain.Admin
	byIDCalls   []string
	byEmailCall []string
}

func (f *fakeAdminUsecase) GetAdminByID(id string) (*domain.Admin, error) {
	f.byIDCalls = append(f.byIDCalls, id)
	return f.adminsByID[id], nil
}

func (f *fakeAdminUsecase) GetAdminByEmail(email string) (*domain.Admin, error) {
	f.byEmailCall = append(f.byEmailCall, email)
	return nil, nil
}

func newTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	return gin.New()
}

// TestGetAdminByIDLooksUpByID covers #22: the route must resolve the URL id
// through GetAdminByID and keep the {"admin": ...} response shape.
func TestGetAdminByIDLooksUpByID(t *testing.T) {
	admin := &domain.Admin{ID: "admin-1", Email: "root@example.com", Name: "Root", IsApproved: true}
	repo := &fakeAdminUsecase{adminsByID: map[string]*domain.Admin{"admin-1": admin}}

	r := newTestRouter()
	NewAdminHandler(repo, "secret").RegisterRoutes(r.Group("/api/admin"))

	req := httptest.NewRequest(http.MethodGet, "/api/admin/admin-1", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if len(repo.byIDCalls) != 1 || repo.byIDCalls[0] != "admin-1" {
		t.Fatalf("expected one GetAdminByID(admin-1) call, got %v", repo.byIDCalls)
	}
	if len(repo.byEmailCall) != 0 {
		t.Fatalf("GetAdminByEmail must not be used by GET /:id, got %v", repo.byEmailCall)
	}

	var body struct {
		Admin struct {
			ID    string `json:"id"`
			Email string `json:"email"`
			Name  string `json:"name"`
		} `json:"admin"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body %s: %v", w.Body.String(), err)
	}
	if body.Admin.ID != "admin-1" || body.Admin.Email != "root@example.com" {
		t.Fatalf("unexpected payload: %s", w.Body.String())
	}
}

// TestGetAdminByIDUnknownReturns404 checks the nil guard added with #22.
func TestGetAdminByIDUnknownReturns404(t *testing.T) {
	repo := &fakeAdminUsecase{adminsByID: map[string]*domain.Admin{}}

	r := newTestRouter()
	NewAdminHandler(repo, "secret").RegisterRoutes(r.Group("/api/admin"))

	req := httptest.NewRequest(http.MethodGet, "/api/admin/missing", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (body %s)", w.Code, w.Body.String())
	}
}

// sentNotification records a SendNotification call (#28 regression checks).
type sentNotification struct {
	Title       string
	Message     string
	Type        string
	RecipientID string
}

// fakeNotificationUsecase records SendNotification calls.
type fakeNotificationUsecase struct {
	usecase.NotificationUsecase
	sent chan sentNotification
}

func (f *fakeNotificationUsecase) SendNotification(title, message, Type, recipientID string) error {
	f.sent <- sentNotification{Title: title, Message: message, Type: Type, RecipientID: recipientID}
	return nil
}

// fakeStudentUsecase only implements what AddStudent needs.
type fakeStudentUsecase struct {
	usecase.StudentUsecase
	added []domain.Student
}

func (f *fakeStudentUsecase) AddStudent(student domain.Student) error {
	f.added = append(f.added, student)
	return nil
}

// TestAddStudentSendsNoGlobalBroadcast covers #28: registering a student must
// not fan out the "Feadback questions are added" notice to everyone.
func TestAddStudentSendsNoGlobalBroadcast(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := newTestRouter()
	notif := &fakeNotificationUsecase{sent: make(chan sentNotification, 8)}
	students := &fakeStudentUsecase{}
	NewStudentHandler(students, notif).RegisterRoutes(r.Group("/api/student"))

	body, err := json.Marshal(domain.Student{Name: "New Kid", TelegramID: "999001"})
	if err != nil {
		t.Fatalf("marshal student: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/student/", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if len(students.added) != 1 {
		t.Fatalf("student not persisted: %+v", students.added)
	}
	select {
	case n := <-notif.sent:
		t.Fatalf("registration sent a notification: %+v", n)
	case <-time.After(150 * time.Millisecond):
	}
}
