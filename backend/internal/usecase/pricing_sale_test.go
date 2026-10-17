package usecase

import (
	"testing"

	"victory-contest-go/internal/domain"
)

// Phase 5: ValidatePlan must reject a malformed sale, not just a well-formed
// one. EffectivePrice silently falls back to the normal price when a sale fails
// its checks, so an unvalidated sale becomes saved garbage the student never
// sees. These cases pin that the admin cannot persist one.

func salePlan(sale *domain.Sale) domain.PricePlan {
	return domain.PricePlan{
		Name:        "pro",
		AllPrograms: true,
		Prices:      []domain.Money{{Currency: domain.CurrencyETB, Amount: 100}},
		Validity:    domain.Validity{Type: domain.ValidityDays, Days: 30},
		Sale:        sale,
	}
}

func etb(amount int64) domain.Money {
	return domain.Money{Currency: domain.CurrencyETB, Amount: amount}
}

func xtr(amount int64) domain.Money {
	return domain.Money{Currency: domain.CurrencyXTR, Amount: amount}
}

func TestValidatePlanSale(t *testing.T) {
	u := &PricingUsecase{}

	valid := salePlan(&domain.Sale{
		Prices:   []domain.Money{{Currency: domain.CurrencyETB, Amount: 80}},
		StartsAt: "2026-01-01T00:00:00Z",
		EndsAt:   "2026-01-31T23:59:59Z",
	})
	if err := u.ValidatePlan(valid); err != nil {
		t.Fatalf("a real discount must validate, got %v", err)
	}

	bad := []struct {
		name string
		sale *domain.Sale
	}{
		{"unparseable start", &domain.Sale{Prices: []domain.Money{etb(80)}, StartsAt: "not-a-date", EndsAt: "2026-01-31T23:59:59Z"}},
		{"unparseable end", &domain.Sale{Prices: []domain.Money{etb(80)}, StartsAt: "2026-01-01T00:00:00Z", EndsAt: "31/01/2026"}},
		{"missing end", &domain.Sale{Prices: []domain.Money{etb(80)}, StartsAt: "2026-01-01T00:00:00Z"}},
		{"inverted window", &domain.Sale{Prices: []domain.Money{etb(80)}, StartsAt: "2026-02-01T00:00:00Z", EndsAt: "2026-01-01T00:00:00Z"}},
		{"empty prices", &domain.Sale{StartsAt: "2026-01-01T00:00:00Z", EndsAt: "2026-01-31T00:00:00Z"}},
		{"sale >= base", &domain.Sale{Prices: []domain.Money{etb(100)}, StartsAt: "2026-01-01T00:00:00Z", EndsAt: "2026-01-31T00:00:00Z"}},
		{"negative amount", &domain.Sale{Prices: []domain.Money{etb(-5)}, StartsAt: "2026-01-01T00:00:00Z", EndsAt: "2026-01-31T00:00:00Z"}},
		{"currency outside base", &domain.Sale{Prices: []domain.Money{xtr(80)}, StartsAt: "2026-01-01T00:00:00Z", EndsAt: "2026-01-31T00:00:00Z"}},
	}
	for _, tc := range bad {
		if err := u.ValidatePlan(salePlan(tc.sale)); err == nil {
			t.Fatalf("sale %q must be rejected", tc.name)
		}
	}

	// A no-sale plan is still valid (the Sale block must not reject nil).
	if err := u.ValidatePlan(salePlan(nil)); err != nil {
		t.Fatalf("plan without a sale must validate, got %v", err)
	}
}
