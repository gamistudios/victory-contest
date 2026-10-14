package http

import (
	"errors"
	"log"
	"net/http"

	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

// PricingHandler: public plan list, student quote/entitlements, admin CRUD for
// plans and coupons, admin grant/revoke/rebuild (plan §5.12).
type PricingHandler struct {
	pricing      *usecase.PricingUsecase
	payments     usecase.PaymentUsecase
	studentAuth  gin.HandlerFunc
}

func NewPricingHandler(p *usecase.PricingUsecase, pay usecase.PaymentUsecase) *PricingHandler {
	return &PricingHandler{pricing: p, payments: pay}
}

func pricingErr(c *gin.Context, err error) {
	switch {
	case errors.Is(err, usecase.ErrPlanNotFound), errors.Is(err, usecase.ErrCouponNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case errors.Is(err, usecase.ErrPlanInvalid), errors.Is(err, usecase.ErrNoPriceForCurrency),
		errors.Is(err, usecase.ErrCouponInvalid), errors.Is(err, usecase.ErrCouponExpired),
		errors.Is(err, usecase.ErrCouponCurrency):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, usecase.ErrCouponExhausted), errors.Is(err, usecase.ErrCouponStudentLimit):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	default:
		log.Printf("pricing: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
	}
}

func (h *PricingHandler) RegisterRoutes(api *gin.RouterGroup, adminAuth gin.HandlerFunc) {
	pub := api.Group("/pricing")
	pub.GET("", h.ListPlans)
	pub.GET("/", h.ListPlans)
	stu := api.Group("", h.studentAuth)
	stu.POST("/pricing/quote", h.Quote)
	stu.GET("/me/entitlements", h.MyEntitlements)

	adm := api.Group("/pricing-admin", adminAuth)
	adm.GET("/plans", h.AdminPlans)
	adm.POST("/plans", h.SavePlan)
	adm.PUT("/plans/:id", h.SavePlan)
	adm.DELETE("/plans/:id", h.DeletePlan)
	adm.GET("/coupons", h.ListCoupons)
	adm.POST("/coupons", h.SaveCoupon)
	adm.PUT("/coupons/:id", h.SaveCoupon)
	adm.DELETE("/coupons/:id", h.DeleteCoupon)
	adm.POST("/grant", h.Grant)
	adm.POST("/payments/:id/revoke", h.Revoke)
	adm.POST("/entitlements/:student_id/rebuild", h.Rebuild)
	adm.GET("/entitlements/:student_id", h.StudentEntitlements)
}

func (h *PricingHandler) ListPlans(c *gin.Context) {
	plans, err := h.pricing.PublicPlans(c.Query("program_id"))
	if err != nil {
		pricingErr(c, err)
		return
	}
	if plans == nil {
		plans = []domain.PricePlan{}
	}
	c.JSON(http.StatusOK, gin.H{"plans": plans})
}

func (h *PricingHandler) Quote(c *gin.Context) {
	var in struct {
		PlanID     string `json:"plan_id"`
		Currency   string `json:"currency"`
		CouponCode string `json:"coupon_code"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.PlanID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "plan_id is required"})
		return
	}
	if in.Currency == "" {
		in.Currency = domain.CurrencyETB
	}
	q, _, err := h.pricing.Quote(c.GetString(StudentUserIDContextKey), in.PlanID, in.Currency, in.CouponCode)
	if err != nil {
		pricingErr(c, err)
		return
	}
	c.JSON(http.StatusOK, q)
}

func (h *PricingHandler) MyEntitlements(c *gin.Context) {
	es, err := h.pricing.Entitlements(c.GetString(StudentUserIDContextKey))
	if err != nil {
		pricingErr(c, err)
		return
	}
	if es == nil {
		es = []domain.Entitlement{}
	}
	c.JSON(http.StatusOK, gin.H{"entitlements": es, "grace_days": domain.DefaultGraceDays})
}

func (h *PricingHandler) StudentEntitlements(c *gin.Context) {
	es, err := h.pricing.Entitlements(c.Param("student_id"))
	if err != nil {
		pricingErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"entitlements": es})
}

func (h *PricingHandler) AdminPlans(c *gin.Context) {
	plans, err := h.pricing.AdminPlans()
	if err != nil {
		pricingErr(c, err)
		return
	}
	if plans == nil {
		plans = []domain.PricePlan{}
	}
	c.JSON(http.StatusOK, gin.H{"plans": plans})
}

func (h *PricingHandler) SavePlan(c *gin.Context) {
	var p domain.PricePlan
	if err := c.ShouldBindJSON(&p); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if id := c.Param("id"); id != "" {
		p.ID = id
	}
	saved, err := h.pricing.SavePlan(p, "admin")
	if err != nil {
		pricingErr(c, err)
		return
	}
	c.JSON(http.StatusOK, saved)
}

func (h *PricingHandler) DeletePlan(c *gin.Context) {
	if err := h.pricing.DeletePlan(c.Param("id")); err != nil {
		pricingErr(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *PricingHandler) ListCoupons(c *gin.Context) {
	cs, err := h.pricing.ListCoupons()
	if err != nil {
		pricingErr(c, err)
		return
	}
	if cs == nil {
		cs = []domain.Coupon{}
	}
	c.JSON(http.StatusOK, gin.H{"coupons": cs})
}

func (h *PricingHandler) SaveCoupon(c *gin.Context) {
	var cp domain.Coupon
	if err := c.ShouldBindJSON(&cp); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if id := c.Param("id"); id != "" {
		cp.ID = id
	}
	saved, err := h.pricing.SaveCoupon(cp)
	if err != nil {
		pricingErr(c, err)
		return
	}
	c.JSON(http.StatusOK, saved)
}

func (h *PricingHandler) DeleteCoupon(c *gin.Context) {
	if err := h.pricing.DeleteCoupon(c.Param("id")); err != nil {
		pricingErr(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *PricingHandler) Grant(c *gin.Context) {
	var in struct {
		StudentID string `json:"student_id"`
		PlanID    string `json:"plan_id"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || in.StudentID == "" || in.PlanID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "student_id and plan_id are required"})
		return
	}
	pr, err := h.pricing.AdminGrant(in.StudentID, in.PlanID, "admin")
	if err != nil {
		pricingErr(c, err)
		return
	}
	c.JSON(http.StatusOK, pr)
}

func (h *PricingHandler) Revoke(c *gin.Context) {
	rv, ok := h.payments.(interface{ RevokePayment(string) error })
	if !ok {
		c.JSON(http.StatusNotImplemented, gin.H{"error": "revoke unavailable"})
		return
	}
	if err := rv.RevokePayment(c.Param("id")); err != nil {
		if errors.Is(err, usecase.ErrPaymentNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		pricingErr(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *PricingHandler) Rebuild(c *gin.Context) {
	es, err := h.pricing.Rebuild(c.Param("student_id"))
	if err != nil {
		pricingErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"entitlements": es})
}
