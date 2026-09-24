package usecase

import (
	"errors"
	"testing"
	"victor-contest-go/internal/domain"
)

// fakeAiSettingsRepo is the in-memory AiSettingsRepository mirroring the
// missing-row-is-default semantics of the Dynamo implementation.
type fakeAiSettingsRepo struct {
	row     *domain.AISettings // nil = never written
	saveErr error
	getErr  error
}

func (f *fakeAiSettingsRepo) GetSettings() (domain.AISettings, error) {
	if f.getErr != nil {
		return domain.AISettings{}, f.getErr
	}
	if f.row == nil {
		return domain.AISettings{ID: domain.AISettingsID}, nil
	}
	return *f.row, nil
}

func (f *fakeAiSettingsRepo) SaveSettings(s domain.AISettings) error {
	if f.saveErr != nil {
		return f.saveErr
	}
	c := s
	f.row = &c
	return nil
}

func TestAiSettingsRoundTrip(t *testing.T) {
	repo := &fakeAiSettingsRepo{}
	u := NewAiSettingsUsecase(repo, nil)

	s, err := u.GetSettings()
	if err != nil || s.RequirePremium {
		t.Fatalf("unset settings = %+v err %v, want require_premium=false", s, err)
	}
	// Save always pins the single-row id.
	if err := u.SaveSettings(domain.AISettings{RequirePremium: true}); err != nil {
		t.Fatal(err)
	}
	if repo.row == nil || repo.row.ID != domain.AISettingsID || !repo.row.RequirePremium {
		t.Fatalf("stored row = %+v", repo.row)
	}
	if !u.RequirePremium() {
		t.Fatal("RequirePremium = false after saving true")
	}
	if err := u.SaveSettings(domain.AISettings{RequirePremium: false}); err != nil {
		t.Fatal(err)
	}
	if u.RequirePremium() {
		t.Fatal("RequirePremium = true after saving false")
	}
}

// RequirePremium fails OPEN on a settings read error: the AI surface has
// been public so far, a flaky table must not 403 everyone (documented
// deliberate choice, mirrors enrichStudent's non-fatal lookup failures).
func TestAiSettingsRequirePremiumFailOpen(t *testing.T) {
	u := NewAiSettingsUsecase(&fakeAiSettingsRepo{getErr: errors.New("dynamo down")}, nil)
	if u.RequirePremium() {
		t.Fatal("read error must be treated as require_premium=false")
	}
}

// IsPremiumStudent reuses the canonical derivation: Approved + future
// expiration (same rule as studentUsecase.enrichStudent).
func TestAiSettingsIsPremiumStudent(t *testing.T) {
	future, past := futureTime(), pastTime()
	pay := &stubPaymentRepo{byUser: map[string][]domain.PaymentRequest{
		"paid":    {{UserID: "paid", Status: domain.StatusApproved, ExpirationDate: ptrTime(future)}},
		"expired": {{UserID: "expired", Status: domain.StatusApproved, ExpirationDate: ptrTime(past)}},
		"pending": {{UserID: "pending", Status: domain.StatusPending, ExpirationDate: ptrTime(future)}},
		"noexp":   {{UserID: "noexp", Status: domain.StatusApproved}},
	}}
	u := NewAiSettingsUsecase(&fakeAiSettingsRepo{}, pay)

	if !u.IsPremiumStudent("paid") {
		t.Fatal("approved unexpired payment must grant premium")
	}
	for _, id := range []string{"expired", "pending", "noexp", "ghost"} {
		if u.IsPremiumStudent(id) {
			t.Fatalf("%s must NOT be premium", id)
		}
	}
	if u.IsPremiumStudent("") {
		t.Fatal("empty id is never premium")
	}
	// Payment lookup errors are not premium (fail-closed on the grant side).
	broken := NewAiSettingsUsecase(&fakeAiSettingsRepo{}, &stubPaymentRepo{err: errors.New("boom")})
	if broken.IsPremiumStudent("paid") {
		t.Fatal("payment repo error must be treated as not premium")
	}
	// nil payment repo (stripped wiring) ⇒ nobody is premium.
	nilRepo := NewAiSettingsUsecase(&fakeAiSettingsRepo{}, nil)
	if nilRepo.IsPremiumStudent("paid") {
		t.Fatal("nil payment repo must be not premium")
	}
}
