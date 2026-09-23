package http

import (
	"fmt"
	"net/http"
	"victor-contest-go/internal/domain"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// AdminEmailContextKey is set by adminAuth on every authenticated admin request.
const AdminEmailContextKey = "admin_email"

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
		claims := &domain.CustomClaims{}
		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return jwtSecret, nil
		})
		if err != nil || !token.Valid || claims.UserID == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		c.Set(AdminEmailContextKey, claims.UserID)
		c.Next()
	}
}
