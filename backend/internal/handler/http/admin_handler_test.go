package http

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
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
	signInAdmin *domain.Admin
	signInErr   error
	updateCalls []fakeAdminUpdateCall
	updateErr   error
	deleteCalls []string
	deleteErr   error
}

// fakeAdminUpdateCall records the id + flat merge fields a PUT produced.
type fakeAdminUpdateCall struct {
	id     string
	update usecase.AdminUpdate
}

func (f *fakeAdminUsecase) GetAdminByID(id string) (*domain.Admin, error) {
	f.byIDCalls = append(f.byIDCalls, id)
	return f.adminsByID[id], nil
}

func (f *fakeAdminUsecase) GetAdminByEmail(email string) (*domain.Admin, error) {
	f.byEmailCall = append(f.byEmailCall, email)
	return nil, nil
}

func (f *fakeAdminUsecase) SignIn(email, password string) (*domain.Admin, error) {
	return f.signInAdmin, f.signInErr
}

func (f *fakeAdminUsecase) UpdateAdmin(id string, update usecase.AdminUpdate) error {
	f.updateCalls = append(f.updateCalls, fakeAdminUpdateCall{id: id, update: update})
	return f.updateErr
}

func (f *fakeAdminUsecase) DeleteAdmin(id string) error {
	f.deleteCalls = append(f.deleteCalls, id)
	return f.deleteErr
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

// TestSignInUnapprovedAdminGets403NoCookie covers the approval gate: valid
// credentials on an unapproved account must answer 403 with the stable
// machine-readable error and must NOT set the session cookie.
func TestSignInUnapprovedAdminGets403NoCookie(t *testing.T) {
	repo := &fakeAdminUsecase{signInErr: usecase.ErrNotApproved}

	r := newTestRouter()
	NewAdminHandler(repo, "secret").RegisterRoutes(r.Group("/api/admin"))

	body, _ := json.Marshal(gin.H{"email": "new@example.com", "password": "hunter2"})
	req := httptest.NewRequest(http.MethodPost, "/api/admin/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 (body %s)", w.Code, w.Body.String())
	}
	var payload map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode body %s: %v", w.Body.String(), err)
	}
	if payload["error"] != "account not approved" {
		t.Fatalf("error = %q, want %q", payload["error"], "account not approved")
	}
	if cookie := w.Header().Get("Set-Cookie"); cookie != "" {
		t.Fatalf("no Set-Cookie expected on 403, got %q", cookie)
	}
}

// TestSignInInvalidCredentialsGets401 pins the existing 401 contract (and the
// absence of a cookie) next to the new 403 branch.
func TestSignInInvalidCredentialsGets401(t *testing.T) {
	repo := &fakeAdminUsecase{signInErr: usecase.ErrInvalidCredentials}

	r := newTestRouter()
	NewAdminHandler(repo, "secret").RegisterRoutes(r.Group("/api/admin"))

	body, _ := json.Marshal(gin.H{"email": "nobody@example.com", "password": "wrong"})
	req := httptest.NewRequest(http.MethodPost, "/api/admin/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 (body %s)", w.Code, w.Body.String())
	}
	if cookie := w.Header().Get("Set-Cookie"); cookie != "" {
		t.Fatalf("no Set-Cookie expected on 401, got %q", cookie)
	}
}

// TestLogoutClearsTokenCookie covers the new public POST /api/admin/logout:
// the expiry cookie must carry the same attributes it was issued with so the
// browser actually drops it.
func TestLogoutClearsTokenCookie(t *testing.T) {
	r := newTestRouter()
	NewAdminHandler(&fakeAdminUsecase{}, "secret").RegisterRoutes(r.Group("/api/admin"))

	req := httptest.NewRequest(http.MethodPost, "/api/admin/logout", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", w.Code, w.Body.String())
	}
	cookie := w.Header().Get("Set-Cookie")
	// Go serializes a negative MaxAge as "Max-Age=0" next to the epoch
	// Expires date; both mark the cookie dead, so accept either spelling.
	if !strings.Contains(cookie, "Max-Age=-1") && !strings.Contains(cookie, "Max-Age=0") {
		t.Fatalf("logout cookie %q must expire immediately", cookie)
	}
	for _, want := range []string{"token=", "Path=/", "HttpOnly", "Secure", "SameSite=None"} {
		if !strings.Contains(cookie, want) {
			t.Fatalf("logout cookie %q missing %q", cookie, want)
		}
	}
}

// TestUpdateAdminSendsFlatPartialMergeToUsecase checks the PUT contract the
// panel now uses: route keyed by admin.id, flat body, and a partial body only
// carries is_approved (name/password stay nil => untouched).
func TestUpdateAdminSendsFlatPartialMergeToUsecase(t *testing.T) {
	repo := &fakeAdminUsecase{adminsByID: map[string]*domain.Admin{}}

	r := newTestRouter()
	NewAdminHandler(repo, "secret").RegisterRoutes(r.Group("/api/admin"))

	body, _ := json.Marshal(gin.H{"is_approved": true})
	req := httptest.NewRequest(http.MethodPut, "/api/admin/admin-1", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", w.Code, w.Body.String())
	}
	if len(repo.updateCalls) != 1 || repo.updateCalls[0].id != "admin-1" {
		t.Fatalf("expected one UpdateAdmin(admin-1) call, got %v", repo.updateCalls)
	}
	upd := repo.updateCalls[0].update
	if upd.IsApproved == nil || !*upd.IsApproved {
		t.Fatalf("IsApproved = %v, want true", upd.IsApproved)
	}
	if upd.Name != nil || upd.Password != nil {
		t.Fatalf("partial body must not set Name/Password, got %+v", upd)
	}
}

// TestUpdateAdminUnknownIDReturns404 pins the no-orphan-write rule at the
// handler boundary (the usecase reports ErrAdminNotFound).
func TestUpdateAdminUnknownIDReturns404(t *testing.T) {
	repo := &fakeAdminUsecase{updateErr: usecase.ErrAdminNotFound}

	r := newTestRouter()
	NewAdminHandler(repo, "secret").RegisterRoutes(r.Group("/api/admin"))

	body, _ := json.Marshal(gin.H{"is_approved": true})
	req := httptest.NewRequest(http.MethodPut, "/api/admin/ghost", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (body %s)", w.Code, w.Body.String())
	}
}

// TestDeleteAdminRoutesByIDAnd404sOnUnknown checks DELETE is keyed by id and
// surfaces ErrAdminNotFound as 404 instead of a silent success.
func TestDeleteAdminRoutesByIDAnd404sOnUnknown(t *testing.T) {
	repo := &fakeAdminUsecase{deleteErr: usecase.ErrAdminNotFound}

	r := newTestRouter()
	NewAdminHandler(repo, "secret").RegisterRoutes(r.Group("/api/admin"))

	req := httptest.NewRequest(http.MethodDelete, "/api/admin/admin-9", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 (body %s)", w.Code, w.Body.String())
	}
	if len(repo.deleteCalls) != 1 || repo.deleteCalls[0] != "admin-9" {
		t.Fatalf("expected one DeleteAdmin(admin-9) call, got %v", repo.deleteCalls)
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
