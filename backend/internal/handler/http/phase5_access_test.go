package http

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"victory-contest-go/internal/domain"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// Handler-level coverage for the Phase 5 access gates: the payment/:user_id IDOR
// fix (a student may read only their own ledger), requireRole, and requireProgram.
// Roles are resolved per request from the admin row (not a token claim), so these
// tests drive real middleware with real HS256 tokens and an in-memory lookup.

const p5Secret = "phase5-access-test-secret"

// p5Token mints a session token. role=="" is an admin; role==StudentRole is a
// student. userID is the subject (admin email / telegram id).
func p5Token(role, userID string) string {
	claims := domain.CustomClaims{UserID: userID, Role: role,
		RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}}
	s, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(p5Secret))
	if err != nil {
		panic(err)
	}
	return s
}

func p5OK(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) }

// p5Engine registers the three Phase 5 gate families against rows: the payment
// IDOR route, an admin report route guarded by requireRole(analyst), and an admin
// board route guarded by requireProgram.
func p5Engine(rows map[string]*domain.Admin) *gin.Engine {
	lookup := AdminLookup(func(email string) (*domain.Admin, error) {
		if a, ok := rows[email]; ok {
			return a, nil
		}
		return nil, nil
	})
	cache := newAdminAccessCache(time.Minute)

	r := gin.New()
	r.GET("/api/payment/:user_id", studentOwnerOrAdminAuth([]byte(p5Secret), "user_id"), p5OK)

	admin := r.Group("/api/admin", adminAuth([]byte(p5Secret)))
	admin.GET("/reports", requireRole(lookup, cache, domain.RoleAnalyst), p5OK)
	admin.GET("/boards", requireProgram(lookup, cache, ""), p5OK)
	return r
}

func p5Rows() map[string]*domain.Admin {
	return map[string]*domain.Admin{
		"super@x.com":   {Email: "super@x.com", IsApproved: true}, // no role => super_admin
		"analyst@x.com": {Email: "analyst@x.com", IsApproved: true, Role: domain.RoleAnalyst},
		"support@x.com": {Email: "support@x.com", IsApproved: true, Role: domain.RoleSupport},
		"prog@x.com":    {Email: "prog@x.com", IsApproved: true, Role: domain.RoleAdmin, ProgramIDs: []string{"g12"}},
	}
}

func p5Do(r *gin.Engine, method, path, bearer, adminCookie string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	if adminCookie != "" {
		req.AddCookie(&http.Cookie{Name: "token", Value: adminCookie})
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestPaymentUserIDReadIsOwnerGated(t *testing.T) {
	r := p5Engine(p5Rows())

	if w := p5Do(r, http.MethodGet, "/api/payment/s1", "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous /payment/:user_id = %d, want 401", w.Code)
	}
	if w := p5Do(r, http.MethodGet, "/api/payment/s1", p5Token(StudentRole, "s1"), ""); w.Code != http.StatusOK {
		t.Fatalf("own /payment/s1 = %d, want 200: %s", w.Code, w.Body.String())
	}
	if w := p5Do(r, http.MethodGet, "/api/payment/s2", p5Token(StudentRole, "s1"), ""); w.Code != http.StatusForbidden {
		t.Fatalf("foreign /payment/s2 = %d, want 403 (IDOR blocked)", w.Code)
	}
	// The admin panel reaches any student's ledger through its cookie.
	if w := p5Do(r, http.MethodGet, "/api/payment/s9", "", p5Token("", "super@x.com")); w.Code != http.StatusOK {
		t.Fatalf("admin /payment/s9 = %d, want 200: %s", w.Code, w.Body.String())
	}
	// A student token must not pass the admin cookie branch.
	if w := p5Do(r, http.MethodGet, "/api/payment/s9", "", p5Token(StudentRole, "s1")); w.Code != http.StatusUnauthorized {
		t.Fatalf("student-as-admin = %d, want 401", w.Code)
	}
}

func TestRequireRole(t *testing.T) {
	r := p5Engine(p5Rows())

	if w := p5Do(r, http.MethodGet, "/api/admin/reports", "", p5Token("", "super@x.com")); w.Code != http.StatusOK {
		t.Fatalf("super admin reports = %d, want 200", w.Code)
	}
	if w := p5Do(r, http.MethodGet, "/api/admin/reports", "", p5Token("", "analyst@x.com")); w.Code != http.StatusOK {
		t.Fatalf("analyst reports = %d, want 200", w.Code)
	}
	if w := p5Do(r, http.MethodGet, "/api/admin/reports", "", p5Token("", "support@x.com")); w.Code != http.StatusForbidden {
		t.Fatalf("support reports = %d, want 403 (role not allowed)", w.Code)
	}
	if w := p5Do(r, http.MethodGet, "/api/admin/reports", "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("no cookie reports = %d, want 401", w.Code)
	}
	// Token for a row that no longer exists fails closed.
	if w := p5Do(r, http.MethodGet, "/api/admin/reports", "", p5Token("", "gone@x.com")); w.Code != http.StatusUnauthorized {
		t.Fatalf("unknown admin reports = %d, want 401", w.Code)
	}
}

func TestRequireProgram(t *testing.T) {
	r := p5Engine(p5Rows())

	// Assigned to g12 only: naming g11 is rejected, g12 passes.
	if w := p5Do(r, http.MethodGet, "/api/admin/boards?program_id=g11", "", p5Token("", "prog@x.com")); w.Code != http.StatusForbidden {
		t.Fatalf("assigned admin on foreign program = %d, want 403", w.Code)
	}
	if w := p5Do(r, http.MethodGet, "/api/admin/boards?program_id=g12", "", p5Token("", "prog@x.com")); w.Code != http.StatusOK {
		t.Fatalf("assigned admin on own program = %d, want 200: %s", w.Code, w.Body.String())
	}
	// Super admins are unrestricted.
	if w := p5Do(r, http.MethodGet, "/api/admin/boards?program_id=g99", "", p5Token("", "super@x.com")); w.Code != http.StatusOK {
		t.Fatalf("super admin any program = %d, want 200", w.Code)
	}
}
