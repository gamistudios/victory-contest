package http

import (
	"net/http"
	"testing"
	"time"

	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// Route-protection coverage for Phase 6 habits. The student id is taken from
// the session token (never the body), oversight and plan CRUD are admin + role
// + program gated. Every case here is rejected by middleware or by an early
// handler guard, so it never reaches the nil-backed usecase - which is exactly
// the security property under test. The behaviour past the gate is covered by
// the usecase tests.

func p6Engine(rows map[string]*domain.Admin) *gin.Engine {
	lookup := AdminLookup(func(email string) (*domain.Admin, error) {
		if a, ok := rows[email]; ok {
			return a, nil
		}
		return nil, nil
	})
	cache := newAdminAccessCache(time.Minute)

	uc := usecase.NewHabitUsecase(nil, nil, nil, nil, nil, nil)
	h := NewHabitHandler(uc)
	h.studentAuth = studentAuth([]byte(p5Secret))

	r := gin.New()
	api := r.Group("/api")
	h.RegisterRoutes(api, adminAuth([]byte(p5Secret)),
		requireRole(lookup, cache, domain.RoleAdmin),
		requireProgram(lookup, cache, ""))
	return r
}

func TestHabitStudentRoutesRequireStudentSession(t *testing.T) {
	r := p6Engine(p5Rows())

	// Anonymous student route is refused.
	if w := p5Do(r, http.MethodGet, "/api/habits/today?plan_id=p1", "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous /habits/today = %d, want 401", w.Code)
	}
	// The admin cookie must not open a student route (cross-role, S2).
	if w := p5Do(r, http.MethodGet, "/api/habits/today?plan_id=p1", "", p5Token("", "super@x.com")); w.Code != http.StatusUnauthorized {
		t.Fatalf("admin-as-student /habits/today = %d, want 401", w.Code)
	}
	// A valid student clears the gate: missing plan_id answers 400 from the
	// handler, which proves auth opened but the store was never consulted.
	if w := p5Do(r, http.MethodGet, "/api/habits/today", p5Token(StudentRole, "s1"), ""); w.Code != http.StatusBadRequest {
		t.Fatalf("student, no plan_id = %d, want 400 (past the auth gate): %s", w.Code, w.Body.String())
	}
	// Same for PUT /check: a malformed body is 400, not 401/403.
	if w := p5Do(r, http.MethodPut, "/api/habits/check", p5Token(StudentRole, "s1"), ""); w.Code != http.StatusBadRequest {
		t.Fatalf("student, bad check body = %d, want 400", w.Code)
	}
}

func TestHabitAdminRoutesAreRoleAndProgramGated(t *testing.T) {
	r := p6Engine(p5Rows())

	// Anonymous admin oversight.
	if w := p5Do(r, http.MethodGet, "/api/admin/habits/oversight", "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous oversight = %d, want 401", w.Code)
	}
	// A student Bearer does not satisfy adminAuth, which reads the admin cookie only.
	if w := p5Do(r, http.MethodGet, "/api/admin/habits/oversight", p5Token(StudentRole, "s1"), ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("student bearer oversight = %d, want 401", w.Code)
	}
	// Roles outside admin are refused by requireRole.
	if w := p5Do(r, http.MethodGet, "/api/admin/habits/oversight", "", p5Token("", "support@x.com")); w.Code != http.StatusForbidden {
		t.Fatalf("support oversight = %d, want 403", w.Code)
	}
	if w := p5Do(r, http.MethodGet, "/api/admin/habits/oversight", "", p5Token("", "analyst@x.com")); w.Code != http.StatusForbidden {
		t.Fatalf("analyst oversight = %d, want 403", w.Code)
	}
	// An assigned admin naming a program they do not own is blocked by requireProgram.
	if w := p5Do(r, http.MethodGet, "/api/admin/habits/oversight?program_id=g11", "", p5Token("", "prog@x.com")); w.Code != http.StatusForbidden {
		t.Fatalf("assigned admin, foreign program = %d, want 403", w.Code)
	}
}
