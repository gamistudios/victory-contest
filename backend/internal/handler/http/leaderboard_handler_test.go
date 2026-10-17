package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// Handler-level coverage for the Phase 3 leaderboard reads (plan §5.5): the student
// auth gate, the enrolment/stream access rules, and the admin gate. The board
// *aggregation* lives in leaderboard_usecase_test.go; this pins the HTTP wiring the
// two apps rely on.

const lbTestSecret = "leaderboard-test-secret"

// lbRepo is an in-memory board store. Top returns the same two rows for any key so
// the tests assert on the route rules, not on key derivation.
type lbRepo struct{}

func (lbRepo) PutRows([]domain.BoardRow) error              { return nil }
func (lbRepo) DeleteRow(string) error                       { return nil }
func (lbRepo) CountAbove(string, int64) (int, error)        { return 0, nil }
func (lbRepo) Get(string, string) (*domain.BoardRow, error) { return nil, nil }
func (lbRepo) Top(string, int) ([]domain.BoardRow, error) {
	return []domain.BoardRow{
		{StudentID: "s1", Name: "Ada", Points: 30},
		{StudentID: "s2", Name: "Bob", Points: 20},
	}, nil
}

type lbStudents struct{}

func (lbStudents) GetStudentByID(id string) (*domain.Student, error) {
	if id != "s1" {
		return nil, nil
	}
	return &domain.Student{
		ID: "s1", PrimaryProgramID: "g12",
		Enrollments: []domain.Enrollment{{ProgramID: "g12", StreamID: "natural"}},
	}, nil
}

func lbEngine() *gin.Engine {
	uc := usecase.NewLeaderboardUsecase(lbRepo{}, nil, lbStudents{})
	h := NewLeaderboardHandler(uc)
	h.studentAuth = studentAuth([]byte(lbTestSecret))
	r := gin.New()
	h.RegisterRoutes(r.Group("/api"), adminAuth([]byte(lbTestSecret)))
	return r
}

// lbStudentToken mints a student session token (Role == StudentRole).
func lbStudentToken(userID string) string {
	claims := domain.CustomClaims{UserID: userID, Role: StudentRole,
		RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}}
	s, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(lbTestSecret))
	if err != nil {
		panic(err)
	}
	return s
}

// lbAdminToken mints an admin token (empty Role) for the "token" cookie.
func lbAdminToken() string {
	claims := domain.CustomClaims{UserID: "admin@example.com", Role: "",
		RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}}
	s, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(lbTestSecret))
	if err != nil {
		panic(err)
	}
	return s
}

func TestLeaderboardRequiresStudentSession(t *testing.T) {
	w := httptest.NewRecorder()
	lbEngine().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/leaderboard", nil))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous /leaderboard = %d, want 401", w.Code)
	}
}

func TestLeaderboardReturnsOwnBoard(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/leaderboard?period=week&program=g12", nil)
	req.Header.Set("Authorization", "Bearer "+lbStudentToken("s1"))
	w := httptest.NewRecorder()
	lbEngine().ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("/leaderboard = %d, want 200: %s", w.Code, w.Body.String())
	}
	var v usecase.BoardView
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatalf("body is not a BoardView: %v", err)
	}
	if v.ProgramID != "g12" || len(v.Entries) != 2 {
		t.Fatalf("view = %+v, want program g12 with 2 entries", v)
	}
	if v.Me == nil || v.Me.StudentID != "s1" {
		t.Fatalf("me = %+v, want the caller (s1) pinned", v.Me)
	}
}

func TestLeaderboardRefusesForeignStream(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/leaderboard?program=g12&stream=social", nil)
	req.Header.Set("Authorization", "Bearer "+lbStudentToken("s1"))
	w := httptest.NewRecorder()
	lbEngine().ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("foreign-stream board = %d, want 403: %s", w.Code, w.Body.String())
	}
}

func TestLeaderboardRefusesUnenrolledProgram(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/leaderboard?program=g11", nil)
	req.Header.Set("Authorization", "Bearer "+lbStudentToken("s1"))
	w := httptest.NewRecorder()
	lbEngine().ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("unenrolled program = %d, want 403", w.Code)
	}
}

func TestLeaderboardRejectsBadPeriod(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/leaderboard?period=decade", nil)
	req.Header.Set("Authorization", "Bearer "+lbStudentToken("s1"))
	w := httptest.NewRecorder()
	lbEngine().ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("bad period = %d, want 400: %s", w.Code, w.Body.String())
	}
}

func TestLeaderboardProgramsListsEnrolments(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/leaderboard/programs", nil)
	req.Header.Set("Authorization", "Bearer "+lbStudentToken("s1"))
	w := httptest.NewRecorder()
	lbEngine().ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("programs = %d, want 200: %s", w.Code, w.Body.String())
	}
	var body struct {
		PrimaryProgramID string              `json:"primary_program_id"`
		Enrollments      []domain.Enrollment `json:"enrollments"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("body: %v", err)
	}
	if body.PrimaryProgramID != "g12" || len(body.Enrollments) != 1 {
		t.Fatalf("programs body = %+v, want primary g12 + 1 enrolment", body)
	}
}

func TestAdminLeaderboardRequiresAdminCookie(t *testing.T) {
	w := httptest.NewRecorder()
	lbEngine().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/admin/leaderboard?program=g12", nil))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("admin board without cookie = %d, want 401", w.Code)
	}
}

func TestAdminLeaderboardServesProgramBoard(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/admin/leaderboard?period=all&program=g12", nil)
	req.AddCookie(&http.Cookie{Name: "token", Value: lbAdminToken()})
	w := httptest.NewRecorder()
	lbEngine().ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("admin board = %d, want 200: %s", w.Code, w.Body.String())
	}
	var v usecase.BoardView
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil || v.ProgramID != "g12" {
		t.Fatalf("admin board view = %+v (err %v), want program g12", v, err)
	}
}

func TestAdminLeaderboardNeedsProgram(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/admin/leaderboard", nil)
	req.AddCookie(&http.Cookie{Name: "token", Value: lbAdminToken()})
	w := httptest.NewRecorder()
	lbEngine().ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("admin board with no program = %d, want 403", w.Code)
	}
}
