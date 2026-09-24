package usecase

import (
	"errors"
	"time"
	"victory-contest-go/internal/domain"
)

// ErrPaymentNotFound is returned by PaymentRepository.DeletePayment (and
// mapped to HTTP 404 by the handler) when no payment row has the given id.
var ErrPaymentNotFound = errors.New("payment not found")

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
	return p.paymentRepo.Create(&payment)
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
	return p.paymentRepo.UpdateStatus(id, status, reason)
}

// DeletePayment implements PaymentUsecase. It removes only the payment row;
// there is deliberately no cascade to the student profile — premium is
// derived at read time from unexpired approved payments (README #8).
// Returns ErrPaymentNotFound when the row does not exist.
func (p *paymentUsecase) DeletePayment(id string) error {
	return p.paymentRepo.DeletePayment(id)
}

func NewPaymentUsecases(payRepo PaymentRepository) PaymentUsecase {
	return &paymentUsecase{paymentRepo: payRepo}
}
