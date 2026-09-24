package http

import (
	"fmt"
	"net/http"
	"strings"
	"victor-contest-go/internal/domain"

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
