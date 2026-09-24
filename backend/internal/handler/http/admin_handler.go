package http

import (
	"errors"
	"fmt"
	"strings"

	"net/http"
	"time"
	"victor-contest-go/internal/domain"
	"victor-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type AdminHandler struct {
	usecase   usecase.AdminUsecase
	jwtSecret []byte
}

func NewAdminHandler(u usecase.AdminUsecase, jwtSecret string) *AdminHandler {
	return &AdminHandler{usecase: u, jwtSecret: []byte(jwtSecret)}
}

func (h *AdminHandler) RegisterRoutes(rg *gin.RouterGroup, adminAuth ...gin.HandlerFunc) {
	// Everything except login requires a valid admin cookie.
	auth := rg.Group("", adminAuth...)
	auth.POST("/register", h.AddAdmin)
	auth.PUT("/:id", h.UpdateAdmin)
	auth.DELETE("/:id", h.DeleteAdmin)
	auth.GET("/:id", h.GetAdminByID)
	auth.GET("/me", h.GetMe)
	auth.GET("/", h.GetAllAdmins)
	auth.GET("/dashboard", h.GetDashboardStats)
	rg.POST("/login", h.SignIn)
	// Logout is public: clearing the cookie must work even with an
	// expired/invalid token, and the panel's api already calls it.
	rg.POST("/logout", h.Logout)
}
func (h *AdminHandler) GetMe(c *gin.Context) {
	tokenString, err := c.Cookie("token")
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}
	claims := &domain.CustomClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return h.jwtSecret, nil
	})

	if err != nil || !token.Valid {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized: Invalid token"})
		return
	}
	admin, err := h.usecase.GetAdminByEmail(claims.UserID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, admin)

}

type adminInput struct {
	Email    string `json:"email"`
	Name     string `json:"name"`
	Password string `json:"password"`
	// Pointer so a PUT body without is_approved means "unchanged" instead of
	// silently revoking an approved admin.
	IsApproved *bool `json:"is_approved"`
}

func (h *AdminHandler) AddAdmin(c *gin.Context) {
	var req adminInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Password == "" || req.Email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email and password are required"})
		return
	}
	id, err := h.usecase.AddAdmin(domain.Admin{
		Email:    req.Email,
		Name:     req.Name,
		Password: req.Password,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id})
}

func (h *AdminHandler) UpdateAdmin(c *gin.Context) {
	id := c.Param("id")
	var req adminInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// Flat, partial-safe update: the usecase loads the stored row by id and
	// merges only these fields, so the panel must key on admin.id (not email).
	upd := usecase.AdminUpdate{IsApproved: req.IsApproved}
	if req.Name != "" {
		upd.Name = &req.Name
	}
	if req.Password != "" {
		upd.Password = &req.Password
	}
	err := h.usecase.UpdateAdmin(id, upd)
	if errors.Is(err, usecase.ErrAdminNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "admin not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success"})
}

func (h *AdminHandler) DeleteAdmin(c *gin.Context) {
	id := c.Param("id")
	err := h.usecase.DeleteAdmin(id)
	if errors.Is(err, usecase.ErrAdminNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "admin not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success"})
}

func (h *AdminHandler) GetAdminByID(c *gin.Context) {
	id := c.Param("id")
	admin, err := h.usecase.GetAdminByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if admin == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "admin not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"admin": admin})
}

func (h *AdminHandler) GetAllAdmins(c *gin.Context) {
	admins, err := h.usecase.GetAllAdmins()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"admins": admins})
}

func (h *AdminHandler) SignIn(c *gin.Context) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	admin, err := h.usecase.SignIn(req.Email, req.Password)
	if errors.Is(err, usecase.ErrNotApproved) {
		// Valid credentials, but another admin must approve the account
		// first: answer 403 with a stable machine-readable error and set
		// NO session cookie.
		c.JSON(http.StatusForbidden, gin.H{"error": "account not approved"})
		return
	}
	if errors.Is(err, usecase.ErrInvalidCredentials) || admin == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "login failed"})
		return
	}
	claims := domain.CustomClaims{
		UserID: admin.Email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour * 24)), // Token is valid for 24 hours
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "my-auth-service",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(h.jwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create token"})
		return
	}
	cookieMaxAge := 3600 * 24
	cookie := &http.Cookie{
		Name:     "token",
		Value:    tokenString,
		Path:     "/",
		MaxAge:   cookieMaxAge, // 1 hour in seconds
		HttpOnly: true,
		Secure:   true,                  // Must be true for SameSite=None
		SameSite: http.SameSiteNoneMode, // THE CRUCIAL PART

	}

	http.SetCookie(c.Writer, cookie)

	c.JSON(http.StatusOK, gin.H{"message": "Login successful, cookie set"})
}

// Logout clears the admin session cookie. It is intentionally registered
// outside adminAuth: expiring the cookie is safe (and needed) even when the
// incoming token is already invalid or expired. The attributes must match the
// ones used when the cookie was issued (Path, Secure, SameSite=None), or the
// browser will not overwrite it.
func (h *AdminHandler) Logout(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     "token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteNoneMode,
	})
	c.JSON(http.StatusOK, gin.H{"message": "logged out"})
}

func (h *AdminHandler) GetDashboardStats(c *gin.Context) {
	// Call usecase to get dashboard data
	dashboardStats, err := h.usecase.GetDashboardStats()
	if err != nil {
		// Return appropriate error response based on error type
		if strings.Contains(err.Error(), "connection") || strings.Contains(err.Error(), "timeout") {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error":   "Service temporarily unavailable",
				"message": "Unable to retrieve dashboard data at this time. Please try again later.",
				"code":    503,
			})
			return
		}

		// Generic internal server error for other cases
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Internal server error",
			"message": "An error occurred while retrieving dashboard statistics.",
			"code":    500,
		})
		return
	}

	// Validate that we have valid data before returning
	if dashboardStats == nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Data unavailable",
			"message": "Dashboard statistics are currently unavailable.",
			"code":    500,
		})
		return
	}

	// Return successful response with dashboard data
	c.JSON(http.StatusOK, dashboardStats)
}
