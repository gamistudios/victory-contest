package http

import (
	"errors"
	"fmt"
	"log"
	"strings"

	"net/http"
	"time"
	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type AdminHandler struct {
	usecase   usecase.AdminUsecase
	jwtSecret []byte
	// Phase 5 role resolution, shared with the router so the analytics and
	// revenue gates read the same cache this handler invalidates on a change.
	access *adminAccessCache
	// validProgram, when set (router), rejects assignments to unknown program ids.
	validProgram func(id string) bool
}

func NewAdminHandler(u usecase.AdminUsecase, jwtSecret string) *AdminHandler {
	return &AdminHandler{usecase: u, jwtSecret: []byte(jwtSecret), access: newAdminAccessCache(10 * time.Second)}
}

// Lookup resolves an admin by the email in the token (for role middleware).
func (h *AdminHandler) Lookup() AdminLookup { return h.usecase.GetAdminByEmail }

// AccessCache is the role cache shared with the router's role gates.
func (h *AdminHandler) AccessCache() *adminAccessCache { return h.access }

// adminRoleInfo is one entry of the role catalogue the roster UI renders.
type adminRoleInfo struct {
	Role        string `json:"role"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

var adminRoleCatalog = []adminRoleInfo{
	{domain.RoleSuperAdmin, "Super admin", "Everything, including the admin roster, roles and program assignment."},
	{domain.RoleAdmin, "Admin", "Content, assessments, pricing and payments; limited to assigned programs when any are set."},
	{domain.RoleAnalyst, "Analyst", "Read-only analytics and revenue reports."},
	{domain.RoleSupport, "Support", "Students, payments and access grants; no content or analytics."},
}

func (h *AdminHandler) RegisterRoutes(rg *gin.RouterGroup, adminAuth ...gin.HandlerFunc) {
	// Everything except login requires a valid admin cookie.
	auth := rg.Group("", adminAuth...)
	// Roster-changing routes need super_admin. The gate is only attached when
	// the admin cookie middleware is (production wiring); route-level tests
	// that register without adminAuth stay ungated. A missing role is
	// super_admin, so existing admins keep every route.
	var superOnly []gin.HandlerFunc
	if len(adminAuth) > 0 {
		superOnly = []gin.HandlerFunc{requireRole(h.Lookup(), h.access)}
	}
	with := func(hf gin.HandlerFunc) []gin.HandlerFunc { return append(append([]gin.HandlerFunc{}, superOnly...), hf) }
	auth.POST("/register", with(h.AddAdmin)...)
	auth.PUT("/:id", with(h.UpdateAdmin)...)
	auth.DELETE("/:id", with(h.DeleteAdmin)...)
	auth.PUT("/:id/access", with(h.SetAdminAccess)...)
	auth.GET("/roles", h.GetRoles)
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

	c.JSON(http.StatusOK, withEffectiveRole(*admin))

}

// withEffectiveRole fills the response-only effective_role echo (no role =
// super_admin) so clients never have to re-implement the legacy rule.
func withEffectiveRole(a domain.Admin) domain.Admin {
	a.EffectiveRoleView = a.EffectiveRole()
	return a
}

// GetRoles lists the assignable roles.
func (h *AdminHandler) GetRoles(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"roles": adminRoleCatalog})
}

// SetAdminAccess handles PUT /admin/:id/access: set an admin's role and/or
// program assignment. Fields left out of the body are unchanged; role "" resets
// to the legacy super_admin; program_ids [] clears the restriction.
func (h *AdminHandler) SetAdminAccess(c *gin.Context) {
	var req struct {
		Role       *string   `json:"role"`
		ProgramIDs *[]string `json:"program_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Role == nil && req.ProgramIDs == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "role or program_ids is required"})
		return
	}
	if req.Role != nil {
		r := strings.TrimSpace(*req.Role)
		req.Role = &r
		if r != "" && !domain.ValidAdminRole(r) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
			return
		}
	}
	if req.ProgramIDs != nil && h.validProgram != nil {
		for _, id := range *req.ProgramIDs {
			if id = strings.TrimSpace(id); id != "" && !h.validProgram(id) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "unknown program: " + id})
				return
			}
		}
	}
	err := h.usecase.UpdateAdmin(c.Param("id"), usecase.AdminUpdate{Role: req.Role, ProgramIDs: req.ProgramIDs})
	switch {
	case errors.Is(err, usecase.ErrAdminNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "admin not found"})
		return
	case errors.Is(err, usecase.ErrInvalidRole):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
		return
	case errors.Is(err, usecase.ErrLastSuperAdmin):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	case err != nil:
		log.Printf("set admin access: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update admin access"})
		return
	}
	h.access.invalidate()
	admin, err := h.usecase.GetAdminByID(c.Param("id"))
	if err != nil || admin == nil {
		c.JSON(http.StatusOK, gin.H{"message": "success"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"admin": withEffectiveRole(*admin)})
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
	if errors.Is(err, usecase.ErrLastSuperAdmin) {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.access.invalidate()
	c.JSON(http.StatusOK, gin.H{"message": "success"})
}

func (h *AdminHandler) DeleteAdmin(c *gin.Context) {
	id := c.Param("id")
	err := h.usecase.DeleteAdmin(id)
	if errors.Is(err, usecase.ErrAdminNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "admin not found"})
		return
	}
	if errors.Is(err, usecase.ErrLastSuperAdmin) {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.access.invalidate()
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
	c.JSON(http.StatusOK, gin.H{"admin": withEffectiveRole(*admin)})
}

func (h *AdminHandler) GetAllAdmins(c *gin.Context) {
	admins, err := h.usecase.GetAllAdmins()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for i := range admins {
		admins[i] = withEffectiveRole(admins[i])
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
	// Call usecase to get dashboard data. ?refresh=1 bypasses the in-memory
	// cache for on-demand up-to-date numbers (client task 4).
	var dashboardStats *domain.DashboardStatsResponse
	var err error
	if c.Query("refresh") == "1" {
		dashboardStats, err = h.usecase.RefreshDashboardStats()
	} else {
		dashboardStats, err = h.usecase.GetDashboardStats()
	}
	if err != nil {
		log.Printf("dashboard stats: %v", err)
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
