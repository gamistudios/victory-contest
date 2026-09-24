package usecase

import (
	"log"
	"victory-contest-go/internal/domain"
)

// DefaultStarsAmount is the XTR (Telegram Stars) price charged for a premium
// invoice when the admin has not set an explicit stars_amount.
const DefaultStarsAmount = 50

// PaymentSettingsRepository is the persistence port for the single-row payment
// feature settings (table "payment_settings"). GetSettings maps "no row yet"
// to the zero PaymentSettings (allow_stars = false), never an error.
type PaymentSettingsRepository interface {
	GetSettings() (domain.PaymentSettings, error)
	SaveSettings(s domain.PaymentSettings) error
}

// PaymentSettingsUsecase answers the two questions the payment surfaces need —
// "is Stars enabled?" and "what does the invoice cost?" — plus the admin CRUD
// for the switch itself.
type PaymentSettingsUsecase interface {
	GetSettings() (domain.PaymentSettings, error)
	SaveSettings(s domain.PaymentSettings) error
	// AllowStars is the fail-open-to-false read used on the request path: a
	// settings-table read error must not expose the Stars payment option, so
	// it logs and yields false (hidden), mirroring the deliberate default.
	AllowStars() bool
	// StarsAmount is the XTR invoice price read server-side at invoice-creation
	// time; unset (<= 0) or a read error falls back to DefaultStarsAmount.
	StarsAmount() int
}

type paymentSettingsUsecase struct {
	repo PaymentSettingsRepository
}

func NewPaymentSettingsUsecase(repo PaymentSettingsRepository) PaymentSettingsUsecase {
	return &paymentSettingsUsecase{repo: repo}
}

func (u *paymentSettingsUsecase) GetSettings() (domain.PaymentSettings, error) {
	return u.repo.GetSettings()
}

func (u *paymentSettingsUsecase) SaveSettings(s domain.PaymentSettings) error {
	s.ID = domain.PaymentSettingsID
	return u.repo.SaveSettings(s)
}

func (u *paymentSettingsUsecase) AllowStars() bool {
	s, err := u.repo.GetSettings()
	if err != nil {
		log.Printf("payment_settings: GetSettings failed, treating as allow_stars=false: %v", err)
		return false
	}
	return s.AllowStars
}

func (u *paymentSettingsUsecase) StarsAmount() int {
	s, err := u.repo.GetSettings()
	if err != nil {
		log.Printf("payment_settings: GetSettings failed, using default stars amount: %v", err)
		return DefaultStarsAmount
	}
	if s.StarsAmount <= 0 {
		return DefaultStarsAmount
	}
	return s.StarsAmount
}
