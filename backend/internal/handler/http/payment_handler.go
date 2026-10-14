package http

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"victory-contest-go/internal/domain"
	"victory-contest-go/internal/repository"
	"victory-contest-go/internal/usecase"

	"github.com/gin-gonic/gin"
)

type PaymentHandler struct {
	usecase usecase.PaymentUsecase
	imgRepo repository.ImageRepository
	// studentAuthMw is wired by NewRouter; when set, POST / requires a
	// student token whose Telegram id equals the form's user_id (S2).
	studentAuthMw gin.HandlerFunc
}

func NewPaymentHandler(paymentUsecase usecase.PaymentUsecase, imgRepo repository.ImageRepository) *PaymentHandler {
	return &PaymentHandler{usecase: paymentUsecase, imgRepo: imgRepo}
}

func (h *PaymentHandler) RegisterRoutes(rg *gin.RouterGroup, adminAuth ...gin.HandlerFunc) {
	// Students create payments and check their own history; approving,
	// rejecting, deleting and cross-user listing are admin-only (issue #7:
	// the approve endpoint used to be public).
	auth := rg.Group("", adminAuth...)
	auth.GET("/", h.GetAllPayments)
	auth.POST("/update", h.UpdatePaymentStatus)
	auth.DELETE("/:id", h.DeletePayment)
	auth.GET("/getexpired", h.GetExpiredPayments)
	auth.GET("/withstatus", h.GetPaymentsWithStatus)
	rg.GET("/:user_id", h.GetByUserId)
	rg.POST("/", withStudentAuth(h.studentAuthMw, h.CreatePayment)...)
}

// GetAllPayments serves GET /api/payment/. The frontend fetches a single
// user's payments via GET /api/payment/:user_id (see paymentServices.ts),
// but a ?user_id= query param here is honored too: it returns that user's
// payments, otherwise all payments. Both branches answer with the
// {"payments": [...]} shape the frontend reads.
func (h *PaymentHandler) GetAllPayments(c *gin.Context) {
	var payments []domain.PaymentRequest
	var err error
	if userID := c.Query("user_id"); userID != "" {
		payments, err = h.usecase.GetPaymentByStudent(userID)
	} else {
		payments, err = h.usecase.GetAllPayments()
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if payments == nil {
		payments = make([]domain.PaymentRequest, 0)
	}
	c.JSON(http.StatusOK, gin.H{"payments": payments})
}
func (h *PaymentHandler) UpdatePaymentStatus(c *gin.Context) {
	var payment domain.PaymentRequest
	if err := c.ShouldBindJSON(&payment); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	paymentId, status, reason := payment.ID, payment.Status, payment.RejectionReason
	paymentStatus := domain.PaymentStatus(status)
	// Approving a plan payment whose reported transfer differs from the
	// server-priced amount needs an explicit ?force=true from the admin.
	if paymentStatus == domain.StatusApproved && c.Query("force") != "true" {
		if stored, gerr := h.usecase.GetPaymentById(paymentId); gerr == nil && stored != nil {
			if exp, rep, bad := usecase.PaymentAmountMismatch(stored); bad {
				c.JSON(http.StatusConflict, gin.H{
					"error":        "reported amount does not match the plan price",
					"code":         "amount_mismatch",
					"expected_etb": exp,
					"reported_etb": rep,
				})
				return
			}
		}
	}
	err := h.usecase.UpdatePaymentStatus(paymentId, paymentStatus, reason)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

func (h *PaymentHandler) CreatePayment(c *gin.Context) {
	userID := c.Request.PostFormValue("user_id")
	fullName := c.Request.PostFormValue("fullName")
	bankName := c.Request.PostFormValue("bankName")

	if userID == "" || fullName == "" || bankName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing required form fields: user_id, fullName, bankName"})
		return
	}
	// The payment may only be filed for the authenticated student (S2):
	// studentAuth has already rejected tokenless calls on this route.
	if !requireMatchingStudent(c, userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "user_id does not match the authenticated student"})
		return
	}

	// Optional `amount` in ETB (README #37 follow-up): the dashboard revenue
	// sums this, so the create path must accept it. Absent/empty = 0 (legacy
	// clients), anything unparsable or non-positive is a client error.
	// Validated BEFORE the screenshot upload so bad input never reaches
	// Cloudinary.
	var amount float64
	if raw := strings.TrimSpace(c.Request.PostFormValue("amount")); raw != "" {
		parsed, err := strconv.ParseFloat(raw, 64)
		planFlow := strings.TrimSpace(c.Request.PostFormValue("plan_id")) != ""
		if err != nil || parsed < 0 || (parsed == 0 && !planFlow) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid 'amount'. Must be a positive number (ETB)."})
			return
		}
		amount = parsed
	}

	// A 100%-coupon plan purchase needs no proof (the usecase verifies the
	// quote is really free and rejects it otherwise).
	freePlanClaim := strings.TrimSpace(c.Request.PostFormValue("plan_id")) != "" &&
		strings.TrimSpace(c.Request.PostFormValue("coupon_code")) != "" && amount == 0
	var img_url string
	file, err := c.FormFile("img")
	if err != nil && !freePlanClaim {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bill screenshot ('img' field) is required"})
		return
	}
	if err == nil {
		// Size/type guard before the upload (README §9 #50).
		if err := validateImageUpload(file); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		openedFile, openErr := file.Open()
		if openErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to open uploaded file"})
			return
		}
		defer openedFile.Close()
		var uploadErr error
		img_url, uploadErr = h.imgRepo.UploadImage(openedFile, "payments")
		if uploadErr != nil {
			// A payment without its screenshot is unauditable; fail instead of
			// storing an empty URL (previously the error was discarded).
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to upload bill screenshot: " + uploadErr.Error()})
			return
		}
		if img_url == "" {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "bill screenshot upload returned no URL"})
			return
		}
	}

	now := time.Now().UTC()
	// ExpirationDate is owned by PaymentUsecase.AddPayment (created_at + 1 month);
	// the handler must not compute it (see README #16).
	payment := domain.PaymentRequest{
		FullName:          fullName,
		BankName:          bankName,
		UserID:            userID,
		BillScreenshotURL: img_url,
		Status:            domain.StatusPending,
		Amount:            amount,
		CreatedAt:         now,
		UpdatedAt:         now,
		RejectionReason:   "",
		// Phase 1: only the plan reference is trusted from the client; the
		// usecase re-derives price, validity and programs server-side.
		PlanID:     strings.TrimSpace(c.Request.PostFormValue("plan_id")),
		CouponCode: strings.TrimSpace(c.Request.PostFormValue("coupon_code")),
		Currency:   strings.ToUpper(strings.TrimSpace(c.Request.PostFormValue("currency"))),
	}

	if err := h.usecase.AddPayment(payment); err != nil {
		if errors.Is(err, usecase.ErrPlanNotFound) || errors.Is(err, usecase.ErrCouponNotFound) ||
			errors.Is(err, usecase.ErrNoPriceForCurrency) || errors.Is(err, usecase.ErrCouponInvalid) ||
			errors.Is(err, usecase.ErrCouponExpired) || errors.Is(err, usecase.ErrCouponCurrency) ||
			errors.Is(err, usecase.ErrProofRequired) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if errors.Is(err, usecase.ErrCouponExhausted) || errors.Is(err, usecase.ErrCouponStudentLimit) {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

// DeletePayment serves DELETE /api/payment/:id. 404 when the row does not
// exist, 200 {"message":"success"} after a successful delete. Deleting a
// payment is admin-only in spirit, but this codebase has no auth middleware
// yet (tracked in README #6), so it matches the unauthenticated style of the
// other delete endpoints. No cascade: premium is derived at read time from
// unexpired approved payments, so removing the row is sufficient.
func (h *PaymentHandler) DeletePayment(c *gin.Context) {
	id := c.Param("id")
	if err := h.usecase.DeletePayment(id); err != nil {
		if errors.Is(err, usecase.ErrPaymentNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success"})
}
func (h *PaymentHandler) GetExpiredPayments(c *gin.Context) {
	payments, err := h.usecase.GetExpiredPayment()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"payments": payments})
}
func (h *PaymentHandler) GetPaymentsWithStatus(c *gin.Context) {
	status := c.Query("status")
	payments, err := h.usecase.GetPaymentByStatus(domain.PaymentStatus(status))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if payments == nil {
		ps := make([]domain.PaymentRequest, 0)
		c.JSON(http.StatusOK, gin.H{"payments": ps})
		return
	}
	c.JSON(http.StatusOK, gin.H{"payments": payments})
}
func (h *PaymentHandler) GetByUserId(c *gin.Context) {
	userId := c.Param("user_id")
	payments, err := h.usecase.GetPaymentByStudent(userId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"payments": payments})
}
