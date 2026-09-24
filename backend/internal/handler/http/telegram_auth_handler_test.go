package http

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"
	"victory-contest-go/internal/domain"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

const (
	authTestSecret   = "test-secret"
	authTestBotToken = "123456:ABC-DEF"
	authTestTelegram = "4242"
)

func signStudentToken(t *testing.T, userID, role string, exp time.Time) string {
	t.Helper()
	claims := domain.CustomClaims{
		UserID: userID,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	tokenString, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(authTestSecret))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return tokenString
}

// buildInitData mirrors Telegram's signing scheme for test payloads.
func buildInitData(t *testing.T, botToken, telegramID string, authDate time.Time) string {
	t.Helper()
	params := url.Values{
		"auth_date": []string{strconv.FormatInt(authDate.Unix(), 10)},
		"user":      []string{`{"id":` + telegramID + `,"first_name":"Ada"}`},
	}
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	lines := make([]string, 0, len(keys))
	for _, k := range keys {
		lines = append(lines, k+"="+params.Get(k))
	}
	secretKey := hmac.New(sha256.New, []byte("WebAppData"))
	secretKey.Write([]byte(botToken))
	mac := hmac.New(sha256.New, secretKey.Sum(nil))
	mac.Write([]byte(strings.Join(lines, "\n")))
	params.Set("hash", hex.EncodeToString(mac.Sum(nil)))
	return params.Encode()
}

func newTelegramAuthRouter(botToken string, allowDev bool) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	api := r.Group("/api")
	newTelegramAuthHandler(authTestSecret, botToken, allowDev).RegisterRoutes(api.Group("/telegram"))
	return r
}

func postJSON(t *testing.T, r *gin.Engine, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestTelegramAuthValidInitData(t *testing.T) {
	r := newTelegramAuthRouter(authTestBotToken, false)
	initData := buildInitData(t, authTestBotToken, authTestTelegram, time.Now())
	body, _ := json.Marshal(map[string]string{"initData": initData})

	w := postJSON(t, r, "/api/telegram/auth", string(body))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", w.Code, w.Body.String())
	}
	var out struct {
		Token  string `json:"token"`
		UserID string `json:"user_id"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.UserID != authTestTelegram {
		t.Errorf("user_id = %q, want %q", out.UserID, authTestTelegram)
	}

	// The issued token must satisfy studentAuth end to end.
	pr := gin.New()
	pr.GET("/protected", studentAuth([]byte(authTestSecret)), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"student": c.GetString(StudentUserIDContextKey)})
	})
	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+out.Token)
	pw := httptest.NewRecorder()
	pr.ServeHTTP(pw, req)
	if pw.Code != http.StatusOK || !strings.Contains(pw.Body.String(), authTestTelegram) {
		t.Fatalf("issued token failed studentAuth: %d %s", pw.Code, pw.Body.String())
	}
}

func TestTelegramAuthRejectsBadInitData(t *testing.T) {
	r := newTelegramAuthRouter(authTestBotToken, false)
	cases := map[string]string{
		"empty initData":  `{"initData":""}`,
		"garbage":         `{"initData":"hash=deadbeef&auth_date=1&user=x"}`,
		"wrong bot token": `{"initData":"` + buildInitData(t, "999:OTHER", authTestTelegram, time.Now()) + `"}`,
		"stale auth_date": `{"initData":"` + buildInitData(t, authTestBotToken, authTestTelegram, time.Now().Add(-8*24*time.Hour)) + `"}`,
	}
	for name, body := range cases {
		w := postJSON(t, r, "/api/telegram/auth", body)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("%s: status = %d, want 401 (body %s)", name, w.Code, w.Body.String())
		}
	}
}

func TestTelegramAuthDisabledWithoutBotToken(t *testing.T) {
	r := newTelegramAuthRouter("", false)
	w := postJSON(t, r, "/api/telegram/auth", `{"initData":"whatever"}`)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503 (body %s)", w.Code, w.Body.String())
	}
}

func TestTelegramDevAuth(t *testing.T) {
	// Disabled (default): the route must not exist at all.
	off := newTelegramAuthRouter(authTestBotToken, false)
	if w := postJSON(t, off, "/api/telegram/auth/dev", `{"user_id":"999001"}`); w.Code != http.StatusNotFound {
		t.Fatalf("ALLOW_DEV_AUTH unset: status = %d, want 404", w.Code)
	}

	// Explicitly enabled: same session token shape as /auth.
	on := newTelegramAuthRouter(authTestBotToken, true)
	w := postJSON(t, on, "/api/telegram/auth/dev", `{"user_id":"999001"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", w.Code, w.Body.String())
	}
	var out struct {
		Token  string `json:"token"`
		UserID string `json:"user_id"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.UserID != "999001" || out.Token == "" {
		t.Fatalf("unexpected dev auth payload: %+v", out)
	}
	if w := postJSON(t, on, "/api/telegram/auth/dev", `{}`); w.Code != http.StatusBadRequest {
		t.Fatalf("missing user_id: status = %d, want 400", w.Code)
	}
}

func TestStudentAuthMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/protected", studentAuth([]byte(authTestSecret)), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"student": c.GetString(StudentUserIDContextKey)})
	})

	studentToken := signStudentToken(t, authTestTelegram, StudentRole, time.Now().Add(time.Hour))
	adminToken := signStudentToken(t, "admin@x.et", "", time.Now().Add(time.Hour))
	expired := signStudentToken(t, authTestTelegram, StudentRole, time.Now().Add(-time.Hour))

	tests := []struct {
		name   string
		header string // Authorization header value, empty = none
		cookie *http.Cookie
		want   int
	}{
		{name: "bearer token", header: "Bearer " + studentToken, want: http.StatusOK},
		{name: "cookie fallback", cookie: &http.Cookie{Name: "student_token", Value: studentToken}, want: http.StatusOK},
		{name: "no credentials", want: http.StatusUnauthorized},
		{name: "admin token rejected", header: "Bearer " + adminToken, want: http.StatusUnauthorized},
		{name: "expired student token", header: "Bearer " + expired, want: http.StatusUnauthorized},
		{name: "garbage", header: "Bearer not-a-jwt", want: http.StatusUnauthorized},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/protected", nil)
			if tc.header != "" {
				req.Header.Set("Authorization", tc.header)
			}
			if tc.cookie != nil {
				req.AddCookie(tc.cookie)
			}
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != tc.want {
				t.Fatalf("status = %d, want %d (body %s)", w.Code, tc.want, w.Body.String())
			}
		})
	}

	// A student JWT in the admin cookie must not pass adminAuth: same signing
	// key, but the role claim marks it as a session token, not an admin one.
	ar := gin.New()
	ar.GET("/admin", adminAuth([]byte(authTestSecret)), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	req.AddCookie(&http.Cookie{Name: "token", Value: studentToken})
	w := httptest.NewRecorder()
	ar.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("student token via admin cookie: status = %d, want 401", w.Code)
	}
}

func TestStudentSelfOrAdminAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.PUT("/students/:id", studentSelfOrAdminAuth([]byte(authTestSecret)), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"updated": c.Param("id")})
	})

	studentToken := signStudentToken(t, authTestTelegram, StudentRole, time.Now().Add(time.Hour))
	adminToken := signStudentToken(t, "admin@x.et", "", time.Now().Add(time.Hour))

	tests := []struct {
		name   string
		id     string
		header string
		cookie *http.Cookie
		want   int
	}{
		{name: "student edits self", id: authTestTelegram, header: "Bearer " + studentToken, want: http.StatusOK},
		{name: "student edits other", id: "111111", header: "Bearer " + studentToken, want: http.StatusForbidden},
		{name: "admin edits any", id: "111111", cookie: &http.Cookie{Name: "token", Value: adminToken}, want: http.StatusOK},
		{name: "student token via admin cookie", id: authTestTelegram, cookie: &http.Cookie{Name: "token", Value: studentToken}, want: http.StatusUnauthorized},
		{name: "no credentials", id: authTestTelegram, want: http.StatusUnauthorized},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPut, "/students/"+tc.id, strings.NewReader(`{}`))
			req.Header.Set("Content-Type", "application/json")
			if tc.header != "" {
				req.Header.Set("Authorization", tc.header)
			}
			if tc.cookie != nil {
				req.AddCookie(tc.cookie)
			}
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != tc.want {
				t.Fatalf("status = %d, want %d (body %s)", w.Code, tc.want, w.Body.String())
			}
		})
	}
}
