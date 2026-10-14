package usecase

import (
	"testing"
	"time"

	"victory-contest-go/internal/domain"
)

func TestValidatePlan(t *testing.T) {
	u := &PricingUsecase{}
	ok := domain.PricePlan{Name: "p", AllPrograms: true,
		Prices:   []domain.Money{{Currency: domain.CurrencyETB, Amount: 100}},
		Validity: domain.Validity{Type: domain.ValidityDays, Days: 30}}
	if err := u.ValidatePlan(ok); err != nil {
		t.Fatal(err)
	}
	bad := []domain.PricePlan{
		{Name: "", AllPrograms: true, Prices: ok.Prices, Validity: ok.Validity},
		{Name: "x", Prices: ok.Prices, Validity: ok.Validity}, // no programs
		{Name: "x", AllPrograms: true, Validity: ok.Validity}, // no prices
		{Name: "x", AllPrograms: true, Prices: []domain.Money{{Currency: "USD", Amount: 1}}, Validity: ok.Validity},
		{Name: "x", AllPrograms: true, Prices: ok.Prices, Validity: domain.Validity{Type: domain.ValidityDays}},
	}
	for i, p := range bad {
		if u.ValidatePlan(p) == nil {
			t.Fatalf("case %d should be invalid", i)
		}
	}
}

// Legacy approved payments (no plan snapshot) become an all-programs grant
// until their stored expiry; revoked and unapproved rows grant nothing.
func TestGrantsForLegacyAndRevoked(t *testing.T) {
	exp := time.Now().Add(10 * 24 * time.Hour)
	repo := &fakePayRepo{rows: []domain.PaymentRequest{
		{ID: "a", UserID: "s", Status: domain.StatusApproved, CreatedAt: time.Now(), ExpirationDate: &exp},
		{ID: "b", UserID: "s", Status: domain.StatusApproved, CreatedAt: time.Now(), ExpirationDate: &exp, Revoked: true},
		{ID: "c", UserID: "s", Status: domain.StatusPending, CreatedAt: time.Now(), ExpirationDate: &exp},
	}}
	u := NewPricingUsecase(nil, nil, nil, repo, func() []string { return []string{"grade-12", "training"} })
	gs, err := u.grantsFor("s")
	if err != nil {
		t.Fatal(err)
	}
	if len(gs) != 1 || len(gs[0].ProgramIDs) != 0 || gs[0].Validity.Type != domain.ValidityFixedEnd {
		t.Fatalf("unexpected grants: %+v", gs)
	}
	es := RebuildEntitlements("s", gs, []string{"grade-12", "training"})
	if len(es) != 2 {
		t.Fatalf("legacy grant must cover all programs, got %d", len(es))
	}
}

type fakePayRepo struct {
	PaymentRepository
	rows []domain.PaymentRequest
}

func (f *fakePayRepo) ListByUser(string) ([]domain.PaymentRequest, error) { return f.rows, nil }
