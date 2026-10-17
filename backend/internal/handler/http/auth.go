package http

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
	"victory-contest-go/internal/domain"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// AdminEmailContextKey is set by adminAuth on every authenticated admin request.
const AdminEmailContextKey = "admin_email"

// StudentUserIDContextKey is set by studentAuth on every authenticated
// student request; it holds the verified Telegram user id as a string.
const StudentUserIDContextKey = "student_user_id"

// StudentRole is the JWT role claim value issued by POST /api/telegram/auth
// and required by studentAuth.
const StudentRole = "student"

// parseJWTClaims verifies a session JWT signed with the shared HS256 secret
// (signature + expiry + non-empty subject) and returns its claims. Callers
// apply the role rule that distinguishes admin tokens (empty Role) from
// student session tokens (Role == StudentRole).
func parseJWTClaims(tokenString string, jwtSecret []byte) (*domain.CustomClaims, bool) {
	claims := &domain.CustomClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return jwtSecret, nil
	})
	if err != nil || !token.Valid || claims.UserID == "" {
		return nil, false
	}
	return claims, true
}

// adminAuth verifies the admin JWT stored in the "token" cookie (issued by
// POST /api/admin/login). It mirrors the parsing done by GetMe: HMAC-only
// algorithm (rejects alg=none / RSA confusion), signature and expiry checks,
// and a non-empty subject. On success the admin email is stored in the
// context under AdminEmailContextKey; on failure the request is aborted with
// 401 before the handler runs.
func adminAuth(jwtSecret []byte) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString, err := c.Cookie("token")
		if err != nil || tokenString == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		// A non-empty role marks a student session token (same signing key):
		// it must never pass the admin gate (S2 cross-role escalation).
		claims, ok := parseJWTClaims(tokenString, jwtSecret)
		if !ok || claims.Role != "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		c.Set(AdminEmailContextKey, claims.UserID)
		c.Next()
	}
}

// studentSessionToken pulls the student JWT from the `Authorization: Bearer`
// header, falling back to the `student_token` cookie.
func studentSessionToken(c *gin.Context) string {
	if authz := c.GetHeader("Authorization"); strings.HasPrefix(authz, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(authz, "Bearer "))
	}
	tok, _ := c.Cookie("student_token")
	return tok
}

// studentAuth verifies the student session JWT issued by
// POST /api/telegram/auth (S2 / #6 remainder). The token is taken from the
// `Authorization: Bearer <jwt>` header first, falling back to a
// `student_token` cookie. Besides the HMAC-only signature and expiry checks
// adminAuth does, the role claim must equal StudentRole and the subject a
// non-empty Telegram user id, which is stored under StudentUserIDContextKey.
func studentAuth(jwtSecret []byte) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := studentSessionToken(c)
		if tokenString == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		claims, ok := parseJWTClaims(tokenString, jwtSecret)
		if !ok || claims.Role != StudentRole {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		c.Set(StudentUserIDContextKey, claims.UserID)
		c.Next()
	}
}

// studentSelfOrAdminAuth gates routes where a student acts on their OWN
// record — PUT /api/student/:id (S2 / #6 remainder). A valid student session
// token must carry the same Telegram id as the path param (403 otherwise);
// the external admin panel keeps access via its admin cookie. Anything else
// is 401.
func studentSelfOrAdminAuth(jwtSecret []byte) gin.HandlerFunc {
	return func(c *gin.Context) {
		if tokenString := studentSessionToken(c); tokenString != "" {
			claims, ok := parseJWTClaims(tokenString, jwtSecret)
			if ok && claims.Role == StudentRole {
				if claims.UserID != strings.TrimSpace(c.Param("id")) {
					c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "can only update your own profile"})
					return
				}
				c.Set(StudentUserIDContextKey, claims.UserID)
				c.Next()
				return
			}
		}
		if tok, err := c.Cookie("token"); err == nil && tok != "" {
			if claims, ok := parseJWTClaims(tok, jwtSecret); ok && claims.Role == "" {
				c.Set(AdminEmailContextKey, claims.UserID)
				c.Next()
				return
			}
		}
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
	}
}

// requireMatchingStudent compares the token-derived student id stored in the
// context by studentAuth against the id the client declared in the payload
// (all three are Telegram-id strings; the student table keys identity on
// telegram_id). Routes that chain studentAuth always have a context id, so a
// mismatch answers 403. When no id is in the context the route was registered
// without the middleware (handler unit tests) and the check passes through.
func requireMatchingStudent(c *gin.Context, declaredID string) bool {
	tokenID := c.GetString(StudentUserIDContextKey)
	if tokenID == "" {
		return true
	}
	return tokenID == strings.TrimSpace(declaredID)
}

// withStudentAuth chains the optional studentAuth middleware (a handler
// struct field set by NewRouter) in front of a handler so RegisterRoutes can
// stay a one-liner and tests that never set the field keep working ungated.
func withStudentAuth(mw gin.HandlerFunc, h gin.HandlerFunc) gin.HandlersChain {
	if mw == nil {
		return gin.HandlersChain{h}
	}
	return gin.HandlersChain{mw, h}
}

// studentOwnerOrAdminAuth gates per-student READ routes (editorial, statistics)
// that carry the student id in the path (D5 / IDOR fix). A valid student
// session must carry the same id as the path param named paramName (403
// otherwise); the admin panel keeps access through its admin cookie. Anything
// else is 401. Unlike studentSelfOrAdminAuth the param name is configurable.
func studentOwnerOrAdminAuth(jwtSecret []byte, paramName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if tokenString := studentSessionToken(c); tokenString != "" {
			claims, ok := parseJWTClaims(tokenString, jwtSecret)
			if ok && claims.Role == StudentRole {
				if claims.UserID != strings.TrimSpace(c.Param(paramName)) {
					c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "can only access your own data"})
					return
				}
				c.Set(StudentUserIDContextKey, claims.UserID)
				c.Next()
				return
			}
		}
		if tok, err := c.Cookie("token"); err == nil && tok != "" {
			if claims, ok := parseJWTClaims(tok, jwtSecret); ok && claims.Role == "" {
				c.Set(AdminEmailContextKey, claims.UserID)
				c.Next()
				return
			}
		}
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
	}
}

// ---- Phase 5: granular admin roles ----------------------------------------
//
// The admin JWT keeps Role=="" (adminAuth depends on it, and student tokens
// share the signing key), so the granular role is NOT a token claim. It is
// resolved per request from the admin row by email: demoting an admin takes
// effect immediately (bounded by the short cache below) and a token minted
// before this phase simply resolves to its stored role - no role means
// super_admin, so nothing existing breaks.

// Context keys set by adminAccess.
const (
	AdminRoleContextKey     = "admin_role"     // effective role string
	AdminProgramsContextKey = "admin_programs" // []string; empty = unrestricted
)

// AdminLookup resolves an admin row by the email carried in the token.
type AdminLookup func(email string) (*domain.Admin, error)

type adminAccessEntry struct {
	role     string
	programs []string
	at       time.Time
}

// adminAccessCache keeps resolved roles for a few seconds so a page that
// fires many admin calls does not hit the admin table for each one.
type adminAccessCache struct {
	mu  sync.Mutex
	m   map[string]adminAccessEntry
	ttl time.Duration
}

func newAdminAccessCache(ttl time.Duration) *adminAccessCache {
	return &adminAccessCache{m: map[string]adminAccessEntry{}, ttl: ttl}
}

func (c *adminAccessCache) get(email string) (adminAccessEntry, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[email]
	if !ok || time.Since(e.at) > c.ttl {
		return adminAccessEntry{}, false
	}
	return e, true
}

func (c *adminAccessCache) set(email string, e adminAccessEntry) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.m) > 256 {
		for k, v := range c.m {
			if time.Since(v.at) > c.ttl {
				delete(c.m, k)
			}
		}
	}
	e.at = time.Now()
	c.m[email] = e
}

func (c *adminAccessCache) invalidate() {
	if c == nil {
		return
	}
	c.mu.Lock()
	c.m = map[string]adminAccessEntry{}
	c.mu.Unlock()
}

// resolveAdminAccess returns the effective role and program assignment of the
// admin already authenticated by adminAuth. A nil lookup (route tests that
// register handlers without wiring) means unrestricted super_admin, which is
// exactly the pre-Phase-5 behaviour.
func resolveAdminAccess(c *gin.Context, lookup AdminLookup, cache *adminAccessCache) (string, []string, error) {
	if lookup == nil {
		return domain.RoleSuperAdmin, nil, nil
	}
	if r, ok := c.Get(AdminRoleContextKey); ok {
		if role, _ := r.(string); role != "" {
			progs, _ := c.Get(AdminProgramsContextKey)
			p, _ := progs.([]string)
			return role, p, nil
		}
	}
	email := c.GetString(AdminEmailContextKey)
	if email == "" {
		return "", nil, errors.New("no admin identity")
	}
	if cache != nil {
		if e, ok := cache.get(email); ok {
			return e.role, e.programs, nil
		}
	}
	a, err := lookup(email)
	if err != nil {
		return "", nil, err
	}
	if a == nil {
		// Token for an admin row that no longer exists: not an admin any more.
		return "", nil, errors.New("admin not found")
	}
	role := a.EffectiveRole()
	if cache != nil {
		cache.set(email, adminAccessEntry{role: role, programs: a.ProgramIDs})
	}
	return role, a.ProgramIDs, nil
}

// adminAccess resolves and stores the role/program assignment in the context.
// It runs after adminAuth. Lookup failures fail closed (403/503).
func adminAccess(lookup AdminLookup, cache *adminAccessCache) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, progs, err := resolveAdminAccess(c, lookup, cache)
		if err != nil {
			if err.Error() == "admin not found" || err.Error() == "no admin identity" {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
				return
			}
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "could not verify admin role"})
			return
		}
		c.Set(AdminRoleContextKey, role)
		c.Set(AdminProgramsContextKey, progs)
		c.Next()
	}
}

// requireRole admits the listed roles; super_admin always passes. A missing
// role is super_admin (backward compatibility). Chain it after adminAuth.
func requireRole(lookup AdminLookup, cache *adminAccessCache, roles ...string) gin.HandlerFunc {
	allowed := map[string]bool{domain.RoleSuperAdmin: true}
	for _, r := range roles {
		allowed[r] = true
	}
	return func(c *gin.Context) {
		role, progs, err := resolveAdminAccess(c, lookup, cache)
		if err != nil {
			if err.Error() == "admin not found" || err.Error() == "no admin identity" {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
				return
			}
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "could not verify admin role"})
			return
		}
		if !allowed[role] {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "your role cannot perform this action"})
			return
		}
		c.Set(AdminRoleContextKey, role)
		c.Set(AdminProgramsContextKey, progs)
		c.Next()
	}
}

// adminProgramsFromContext reads the assignment stored by adminAccess /
// requireRole. Empty means unrestricted.
func adminProgramsFromContext(c *gin.Context) []string {
	v, _ := c.Get(AdminProgramsContextKey)
	p, _ := v.([]string)
	return p
}

// programAllowed reports whether an admin with the given assignment may act on
// programID (an empty assignment is unrestricted).
func programAllowed(assigned []string, programID string) bool {
	if len(assigned) == 0 {
		return true
	}
	for _, id := range assigned {
		if id == programID {
			return true
		}
	}
	return false
}

// requireProgram rejects a request that names a program outside the admin's
// assignment. The program is read from the path param, then the `program_id`,
// `program` and (comma-separated) `program_ids` query values. Requests naming
// no program pass: handlers that list data clamp the result with
// clampScopeFilter instead. Super admins and unassigned admins always pass.
func requireProgram(lookup AdminLookup, cache *adminAccessCache, paramName string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, progs, err := resolveAdminAccess(c, lookup, cache)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "could not verify admin role"})
			return
		}
		c.Set(AdminRoleContextKey, role)
		c.Set(AdminProgramsContextKey, progs)
		if role == domain.RoleSuperAdmin || len(progs) == 0 {
			c.Next()
			return
		}
		var named []string
		if paramName != "" {
			if v := strings.TrimSpace(c.Param(paramName)); v != "" {
				named = append(named, v)
			}
		}
		for _, k := range []string{"program_id", "program"} {
			for _, v := range c.QueryArray(k) {
				if v = strings.TrimSpace(v); v != "" {
					named = append(named, v)
				}
			}
		}
		named = append(named, splitCSV(c.Query("program_ids"))...)
		for _, p := range named {
			if !programAllowed(progs, p) {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "you are not assigned to this program"})
				return
			}
		}
		c.Next()
	}
}

// clampScopeFilter narrows f to the admin's assigned programs. With no program
// in the filter an assigned admin is pinned to their assignment; naming a
// program outside it returns false (caller answers 403). Reuses the existing
// domain.ScopeFilter - no parallel filter type.
func clampScopeFilter(c *gin.Context, f *domain.ScopeFilter) bool {
	role, _ := c.Get(AdminRoleContextKey)
	if r, _ := role.(string); r == domain.RoleSuperAdmin {
		return true
	}
	assigned := adminProgramsFromContext(c)
	if len(assigned) == 0 {
		return true
	}
	if len(f.ProgramIDs) == 0 {
		f.ProgramIDs = append([]string(nil), assigned...)
		return true
	}
	for _, p := range f.ProgramIDs {
		if !programAllowed(assigned, p) {
			return false
		}
	}
	return true
}

func splitCSV(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
