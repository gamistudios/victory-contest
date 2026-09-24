package http

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
	"victory-contest-go/internal/domain"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func signToken(t *testing.T, secret []byte, email string, exp time.Time) string {
	t.Helper()
	claims := domain.CustomClaims{
		UserID: email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return token
}

func newAuthTestRouter(secret string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/protected", adminAuth([]byte(secret)), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"email": c.GetString(AdminEmailContextKey)})
	})
	return r
}

func TestAdminAuth(t *testing.T) {
	const secret = "test-secret"
	r := newAuthTestRouter(secret)

	noneClaims := domain.CustomClaims{
		UserID: "attacker@x.et",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	noneToken, err := jwt.NewWithClaims(jwt.SigningMethodNone, noneClaims).
		SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("sign none token: %v", err)
	}

	tests := []struct {
		name       string
		method     string
		cookie     *http.Cookie
		wantStatus int
		wantEmail  string
	}{
		{
			name:       "valid token",
			cookie:     &http.Cookie{Name: "token", Value: signToken(t, []byte(secret), "admin@x.et", time.Now().Add(time.Hour))},
			wantStatus: http.StatusOK,
			wantEmail:  "admin@x.et",
		},
		{name: "no cookie", wantStatus: http.StatusUnauthorized},
		{name: "empty cookie", cookie: &http.Cookie{Name: "token", Value: ""}, wantStatus: http.StatusUnauthorized},
		{name: "garbage token", cookie: &http.Cookie{Name: "token", Value: "not-a-jwt"}, wantStatus: http.StatusUnauthorized},
		{
			name:       "wrong secret",
			cookie:     &http.Cookie{Name: "token", Value: signToken(t, []byte("other-secret"), "admin@x.et", time.Now().Add(time.Hour))},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "expired token",
			cookie:     &http.Cookie{Name: "token", Value: signToken(t, []byte(secret), "admin@x.et", time.Now().Add(-time.Hour))},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "missing subject",
			cookie:     &http.Cookie{Name: "token", Value: signToken(t, []byte(secret), "", time.Now().Add(time.Hour))},
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "alg none",
			cookie:     &http.Cookie{Name: "token", Value: noneToken},
			wantStatus: http.StatusUnauthorized,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/protected", nil)
			if tc.cookie != nil {
				req.AddCookie(tc.cookie)
			}
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d (body %s)", w.Code, tc.wantStatus, w.Body.String())
			}
			if tc.wantEmail != "" && w.Body.String() != fmt.Sprintf(`{"email":%q}`, tc.wantEmail) {
				t.Fatalf("body = %s, want email %q", w.Body.String(), tc.wantEmail)
			}
		})
	}
}
