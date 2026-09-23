package usecase

import (
	"errors"
	"time"
	"victor-contest-go/internal/domain"
)

// ErrPaymentNotFound is returned by PaymentRepository.DeletePayment (and
// mapped to HTTP 404 by the handler) when no payment row has the given id.
var ErrPaymentNotFound = errors.New("payment not found")

type PaymentUsecase interface {
	AddPayment(payment domain.PaymentRequest) error
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
