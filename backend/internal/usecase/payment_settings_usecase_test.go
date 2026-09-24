package usecase

import (
	"errors"
	"testing"
	"victor-contest-go/internal/domain"
)

// fakePaymentSettingsRepo is the in-memory PaymentSettingsRepository mirroring
// the missing-row-is-default semantics of the Dynamo implementation.
type fakePaymentSettingsRepo struct {
	row     *domain.PaymentSettings // nil = never written
	saveErr error
	getErr  error
}

func (f *fakePaymentSettingsRepo) GetSettings() (domain.PaymentSettings, error) {
	if f.getErr != nil {
		return domain.PaymentSettings{}, f.getErr
	}
	if f.row == nil {
		return domain.PaymentSettings{ID: domain.PaymentSettingsID}, nil
	}
	return *f.row, nil
}

func (f *fakePaymentSettingsRepo) SaveSettings(s domain.PaymentSettings) error {
	if f.saveErr != nil {
		return f.saveErr
	}
	c := s
	f.row = &c
	return nil
}

// stubPaymentSettings is a minimal PaymentSettingsUsecase used to drive the
// Stars gate from the Telegram usecase tests.
type stubPaymentSettings struct {
	allow  bool
	amount int
}

func (s *stubPaymentSettings) GetSettings() (domain.PaymentSettings, error) {
	return domain.PaymentSettings{AllowStars: s.allow, StarsAmount: s.amount}, nil
}
func (s *stubPaymentSettings) SaveSettings(domain.PaymentSettings) error { return nil }
func (s *stubPaymentSettings) AllowStars() bool                          { return s.allow }
func (s *stubPaymentSettings) StarsAmount() int                          { return s.amount }

func TestPaymentSettingsRoundTrip(t *testing.T) {
	repo := &fakePaymentSettingsRepo{}
	u := NewPaymentSettingsUsecase(repo)

	s, err := u.GetSettings()
	if err != nil || s.AllowStars {
		t.Fatalf("unset settings = %+v err %v, want allow_stars=false", s, err)
	}
	if u.AllowStars() {
		t.Fatal("AllowStars = true before saving")
	}
	// Save always pins the single-row id.
	if err := u.SaveSettings(domain.PaymentSettings{AllowStars: true, StarsAmount: 120}); err != nil {
		t.Fatal(err)
	}
	if repo.row == nil || repo.row.ID != domain.PaymentSettingsID || !repo.row.AllowStars {
		t.Fatalf("stored row = %+v", repo.row)
	}
	if !u.AllowStars() {
		t.Fatal("AllowStars = false after saving true")
	}
	if got := u.StarsAmount(); got != 120 {
		t.Fatalf("StarsAmount = %d, want 120", got)
	}
}

// StarsAmount falls back to the sane default for an unset (<= 0) amount, so
// the invoice is never priced at zero.
func TestPaymentStarsAmountDefault(t *testing.T) {
	u := NewPaymentSettingsUsecase(&fakePaymentSettingsRepo{})
	if got := u.StarsAmount(); got != DefaultStarsAmount {
		t.Fatalf("StarsAmount = %d, want default %d", got, DefaultStarsAmount)
	}
	neg := NewPaymentSettingsUsecase(&fakePaymentSettingsRepo{row: &domain.PaymentSettings{StarsAmount: -5}})
	if got := neg.StarsAmount(); got != DefaultStarsAmount {
		t.Fatalf("StarsAmount = %d, want default %d", got, DefaultStarsAmount)
	}
}

// AllowStars fails CLOSED on a settings read error: the Stars option has never
// been public, so a flaky table must keep it hidden rather than expose it.
func TestPaymentSettingsAllowStarsFailClosed(t *testing.T) {
	u := NewPaymentSettingsUsecase(&fakePaymentSettingsRepo{getErr: errors.New("dynamo down")})
	if u.AllowStars() {
		t.Fatal("read error must be treated as allow_stars=false")
	}
	if got := u.StarsAmount(); got != DefaultStarsAmount {
		t.Fatalf("read error StarsAmount = %d, want default %d", got, DefaultStarsAmount)
	}
}
