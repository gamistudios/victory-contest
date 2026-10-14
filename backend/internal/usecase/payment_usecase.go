package usecase

import (
	"errors"
	"log"
	"time"
	"victory-contest-go/internal/domain"
)

// ErrPaymentNotFound is returned by PaymentRepository.DeletePayment (and
// mapped to HTTP 404 by the handler) when no payment row has the given id.
var ErrPaymentNotFound = errors.New("payment not found")

// ErrProofRequired: a non-free purchase must carry the bill screenshot.
var ErrProofRequired = errors.New("a bill screenshot is required unless the coupon makes the plan free")

type PaymentUsecase interface {
	AddPayment(payment domain.PaymentRequest) error
	ConfirmTelegramStarsPayment(paymentID, userID, fullName string) error
	UpdatePaymentStatus(id string, status domain.PaymentStatus, reason string) error
	DeletePayment(id string) error
	GetPaymentById(id string) (*domain.PaymentRequest, error)
	GetPaymentByStudent(studId string) ([]domain.PaymentRequest, error)
	GetExpiredPayment() ([]domain.PaymentRequest, error)
	GetPaymentByStatus(status domain.PaymentStatus) ([]domain.PaymentRequest, error)
	GetAllPayments() ([]domain.PaymentRequest, error)
}

type paymentUsecase struct {
	paymentRepo PaymentRepository
	pricing     *PricingUsecase // optional (Phase 1): plan snapshot + entitlements
}

// RevokePayment marks a payment revoked (refund/fraud) and rebuilds the
// student's entitlements.
type paymentRevoker interface {
	RevokePayment(id string) error
}

// WithPricing wires the pricing usecase; without it behaviour is the legacy
// one-month rule.
func WithPricing(pu PaymentUsecase, pr *PricingUsecase) PaymentUsecase {
	if impl, ok := pu.(*paymentUsecase); ok {
		impl.pricing = pr
	}
	return pu
}

func (p *paymentUsecase) rebuild(studentID string) {
	if p.pricing != nil && studentID != "" {
		if _, err := p.pricing.Rebuild(studentID); err != nil {
			log.Printf("entitlements rebuild for %s: %v", studentID, err)
		}
	}
}

// RevokePayment implements paymentRevoker.
func (p *paymentUsecase) RevokePayment(id string) error {
	pay, err := p.paymentRepo.GetByID(id)
	if err != nil || pay == nil {
		return ErrPaymentNotFound
	}
	if err := p.paymentRepo.SetRevoked(id, true); err != nil {
		return err
	}
	p.rebuild(pay.UserID)
	return nil
}

// GetAllPayments implements PaymentUsecase.
func (p *paymentUsecase) GetAllPayments() ([]domain.PaymentRequest, error) {
	payments, err := p.paymentRepo.ListAll()
	if err != nil {
		return nil, err
	}
	return payments, nil
}

// GetPaymentByStatus implements PaymentUsecase.
func (p *paymentUsecase) GetPaymentByStatus(status domain.PaymentStatus) ([]domain.PaymentRequest, error) {
	return p.paymentRepo.ListByStatus(status)
}

// AddPayment implements PaymentUsecase.
//
// AddPayment is the single authoritative place for the payment expiration rule:
// a payment expires one month after it was created (see README #16).
func (p *paymentUsecase) AddPayment(payment domain.PaymentRequest) error {
	payment.CreatedAt = time.Now().UTC()
	expDate := payment.CreatedAt.AddDate(0, 1, 0)
	payment.ExpirationDate = &expDate
	payment.ID = GenerateUniqueId()
	payment.Revoked = false
	if payment.PlanID != "" {
		// Client-supplied price fields are never trusted: re-derive from the plan.
		planID, cur, code := payment.PlanID, payment.Currency, payment.CouponCode
		payment.FinalAmount, payment.ProgramIDs, payment.Validity, payment.CouponCode = 0, nil, nil, ""
		if p.pricing == nil {
			return ErrPlanNotFound
		}
		if cur == "" {
			cur = domain.CurrencyETB
		}
		free, err := p.pricing.Snapshot(&payment, planID, cur, code)
		if err != nil {
			return err
		}
		if !free && payment.BillScreenshotURL == "" {
			return ErrProofRequired
		}
		if free { // 100% coupon: no proof needed, approve immediately
			payment.Status = domain.StatusApproved
			payment.UpdatedAt = payment.CreatedAt
		}
	}
	if err := p.paymentRepo.Create(&payment); err != nil {
		return err
	}
	if payment.Status == domain.StatusApproved {
		p.rebuild(payment.UserID)
	}
	return nil
}

// ConfirmTelegramStarsPayment implements PaymentUsecase.
//
// The only path where a payment becomes Approved without admin review: the
// Telegram webhook already verified the charge server-side. paymentID is
// derived from the Telegram charge id and doubles as the idempotency key —
// a replayed update finds the existing row and returns without creating a
// duplicate or sliding the expiration window forward. The expiration mirrors
// AddPayment's rule (created_at + 1 month, UTC), which is also what the bank
// flow's admin approval relies on since UpdateStatus never touches it.
func (p *paymentUsecase) ConfirmTelegramStarsPayment(paymentID, userID, fullName string) error {
	if paymentID == "" || userID == "" {
		return errors.New("telegram stars payment requires a payment id and user id")
	}
	if existing, err := p.paymentRepo.GetByID(paymentID); err == nil && existing != nil {
		return nil
	}
	now := time.Now().UTC()
	expDate := now.AddDate(0, 1, 0)
	return p.paymentRepo.Create(&domain.PaymentRequest{
		ID:             paymentID,
		UserID:         userID,
		FullName:       fullName,
		BankName:       "Telegram Stars",
		Status:         domain.StatusApproved,
		CreatedAt:      now,
		UpdatedAt:      now,
		ExpirationDate: &expDate,
	})
}

func (p *paymentUsecase) GetExpiredPayment() ([]domain.PaymentRequest, error) {
	return p.paymentRepo.ListExpired(time.Now().In(time.Local))
}

// GetPaymentById implements PaymentUsecase.
func (p *paymentUsecase) GetPaymentById(id string) (*domain.PaymentRequest, error) {
	return p.paymentRepo.GetByID(id)
}

// GetPaymentByStudent implements PaymentUsecase.
func (p *paymentUsecase) GetPaymentByStudent(studId string) ([]domain.PaymentRequest, error) {
	payments, err := p.paymentRepo.ListByUser(studId)
	if err != nil {
		return nil, err
	}

	return payments, nil
}

// UpdatePayment implements PaymentUsecase.
func (p *paymentUsecase) UpdatePaymentStatus(id string, status domain.PaymentStatus, reason string) error {
	prev, _ := p.paymentRepo.GetByID(id)
	if err := p.paymentRepo.UpdateStatus(id, status, reason); err != nil {
		return err
	}
	// A rejected payment frees its coupon use (only on the transition, so a
	// repeated reject cannot release twice).
	if status == domain.StatusRejected && prev != nil && prev.Status != domain.StatusRejected && !prev.Revoked {
		p.pricing.ReleaseCoupon(prev)
	}
	if pay, err := p.paymentRepo.GetByID(id); err == nil && pay != nil {
		p.rebuild(pay.UserID)
	}
	return nil
}

// DeletePayment implements PaymentUsecase. It removes only the payment row;
// there is deliberately no cascade to the student profile — premium is
// derived at read time from unexpired approved payments (README #8).
// Returns ErrPaymentNotFound when the row does not exist.
func (p *paymentUsecase) DeletePayment(id string) error {
	pay, _ := p.paymentRepo.GetByID(id)
	if err := p.paymentRepo.DeletePayment(id); err != nil {
		return err
	}
	if pay != nil {
		if pay.Status != domain.StatusRejected && !pay.Revoked {
			p.pricing.ReleaseCoupon(pay)
		}
		p.rebuild(pay.UserID)
	}
	return nil
}

func NewPaymentUsecases(payRepo PaymentRepository) PaymentUsecase {
	return &paymentUsecase{paymentRepo: payRepo}
}

// PaymentAmountMismatch compares what the student reported transferring
// (PaymentRequest.Amount, ETB) with what the server priced the plan at
// (FinalAmount, santim). It only applies to plan-based ETB payments that
// reported an amount; legacy rows, free plans and other currencies return
// ok=false (nothing to compare). Used before an admin approves, so a short
// transfer is caught instead of silently granting access.
func PaymentAmountMismatch(pay *domain.PaymentRequest) (expectedETB, reportedETB float64, mismatch bool) {
	if pay == nil || pay.PlanID == "" || pay.FinalAmount <= 0 || pay.Amount <= 0 {
		return 0, 0, false
	}
	if pay.Currency != "" && pay.Currency != domain.CurrencyETB {
		return 0, 0, false
	}
	expectedETB = float64(pay.FinalAmount) / 100
	reportedETB = pay.Amount
	// half a santim of tolerance for float rounding
	d := expectedETB - reportedETB
	if d < 0 {
		d = -d
	}
	return expectedETB, reportedETB, d > 0.005
}
