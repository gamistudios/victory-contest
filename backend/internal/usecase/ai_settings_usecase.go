package usecase

import (
	"log"
	"time"
	"victory-contest-go/internal/domain"
)

// AiSettingsRepository is the persistence port for the single-row AI feature
// settings (table "ai_settings"). GetSettings maps "no row yet" to the zero
// AISettings (require_premium = false), never an error.
type AiSettingsRepository interface {
	GetSettings() (domain.AISettings, error)
	SaveSettings(s domain.AISettings) error
}

// AiSettingsUsecase answers the two questions the /api/ai gate needs —
// "is premium required?" and "is this student premium?" — plus the admin
// CRUD for the switch itself.
type AiSettingsUsecase interface {
	GetSettings() (domain.AISettings, error)
	SaveSettings(s domain.AISettings) error
	// RequirePremium is the fail-open read used on the request path: a
	// settings-table read error must not take the (today public) AI surface
	// down, and defaults to false, mirroring enrichStudent's "lookup failure
	// is logged, not fatal" convention.
	RequirePremium() bool
	// IsPremiumStudent reports whether the student id (Telegram id string,
	// the same key studentAuth stores) holds premium under the canonical
	// derivation. Unknown ids and lookup failures are false.
	IsPremiumStudent(studentID string) bool
}

type aiSettingsUsecase struct {
	repo        AiSettingsRepository
	paymentRepo PaymentRepository
}

func NewAiSettingsUsecase(repo AiSettingsRepository, paymentRepo PaymentRepository) AiSettingsUsecase {
	return &aiSettingsUsecase{repo: repo, paymentRepo: paymentRepo}
}

func (u *aiSettingsUsecase) GetSettings() (domain.AISettings, error) {
	return u.repo.GetSettings()
}

func (u *aiSettingsUsecase) SaveSettings(s domain.AISettings) error {
	s.ID = domain.AISettingsID
	return u.repo.SaveSettings(s)
}

func (u *aiSettingsUsecase) RequirePremium() bool {
	s, err := u.repo.GetSettings()
	if err != nil {
		log.Printf("ai_settings: GetSettings failed, treating as require_premium=false: %v", err)
		return false
	}
	return s.RequirePremium
}

// IsPremiumStudent reuses the canonical premium derivation from
// studentUsecase.enrichStudent: a student is premium iff they have at least
// one Approved payment whose (UTC-stored) expiration date is still in the
// future. Premium is derived at read time from the payment table, never a
// stored bool, so this stays consistent with profile reads automatically.
func (u *aiSettingsUsecase) IsPremiumStudent(studentID string) bool {
	if u.paymentRepo == nil || studentID == "" {
		return false
	}
	payments, err := u.paymentRepo.ListByUser(studentID)
	if err != nil {
		log.Printf("ai_settings: ListByUser(%s) failed, treating as not premium: %v", studentID, err)
		return false
	}
	now := time.Now().UTC()
	for _, pay := range payments {
		if pay.Status == domain.StatusApproved && pay.ExpirationDate != nil && pay.ExpirationDate.After(now) {
			return true
		}
	}
	return false
}
