package usecase

import (
	"errors"
	"testing"
	"time"

	"victory-contest-go/internal/domain"
)

func ts(s string) time.Time { t, _ := time.Parse(time.RFC3339, s); return t }

func plan() domain.PricePlan {
	return domain.PricePlan{
		ID: "p1", Name: "G12 3m", ProgramIDs: []string{"grade-12"}, IsActive: true,
		Validity:   domain.Validity{Type: domain.ValidityDays, Days: 90},
		Prices:     []domain.Money{{Currency: "ETB", Amount: 900}, {Currency: "XTR", Amount: 400}},
		ListPrices: []domain.Money{{Currency: "ETB", Amount: 1200}},
		Sale: &domain.Sale{Prices: []domain.Money{{Currency: "ETB", Amount: 700}},
			StartsAt: "2026-10-10T00:00:00Z", EndsAt: "2026-10-20T00:00:00Z"},
	}
}

func TestEffectivePriceSaleBoundaries(t *testing.T) {
	p := plan()
	cases := map[string]int64{
		"2026-10-09T23:59:59Z": 900,
		"2026-10-10T00:00:00Z": 700, // start inclusive
		"2026-10-20T00:00:00Z": 700, // end inclusive
		"2026-10-20T00:00:01Z": 900,
	}
	for at, want := range cases {
		got, err := EffectivePrice(p, "ETB", ts(at))
		if err != nil || got.Amount != want {
			t.Errorf("%s: got %v %v want %d", at, got, err, want)
		}
	}
	// XTR has no sale price -> normal price even during the sale
	if got, _ := EffectivePrice(p, "XTR", ts("2026-10-15T00:00:00Z")); got.Amount != 400 {
		t.Errorf("xtr got %d", got.Amount)
	}
	p.Prices = p.Prices[:1]
	if _, err := EffectivePrice(p, "XTR", time.Now()); !errors.Is(err, ErrNoPriceForCurrency) {
		t.Error("plan without Stars price must refuse Stars")
	}
}

func TestBuildQuoteCoupons(t *testing.T) {
	p := plan()
	now := ts("2026-10-15T00:00:00Z") // inside sale: 700 ETB
	q, err := BuildQuote(p, "ETB", nil, now, 0)
	if err != nil || q.Final != 700 || q.ListAmount != 1200 || q.Free {
		t.Fatalf("plain quote %+v %v", q, err)
	}
	pct := &domain.Coupon{Code: "save10", Kind: domain.CouponPercent, Value: 10, IsActive: true}
	q, _ = BuildQuote(p, "ETB", pct, now, 0)
	if q.Discount != 70 || q.Final != 630 || q.CouponCode != "SAVE10" {
		t.Errorf("percent %+v", q)
	}
	// A percent discount rounds to the nearest whole birr (there is no
	// sub-unit): 10% of 95 ETB = 9.5 -> 10, final 85.
	pOdd := p
	pOdd.Sale = nil
	pOdd.ListPrices = nil
	pOdd.Prices = []domain.Money{{Currency: "ETB", Amount: 95}}
	q, _ = BuildQuote(pOdd, "ETB", &domain.Coupon{Code: "P10", Kind: domain.CouponPercent, Value: 10, IsActive: true}, now, 0)
	if q.Discount != 10 || q.Final != 85 {
		t.Errorf("percent rounding %+v", q)
	}
	fixed := &domain.Coupon{Code: "F", Kind: domain.CouponFixed, Value: 50, IsActive: true}
	q, _ = BuildQuote(p, "ETB", fixed, now, 0)
	if q.Final != 650 {
		t.Errorf("fixed %+v", q)
	}
	if _, err := BuildQuote(p, "XTR", fixed, now, 0); !errors.Is(err, ErrCouponCurrency) {
		t.Errorf("fixed coupon on XTR must fail: %v", err)
	}
	over := &domain.Coupon{Code: "BIG", Kind: domain.CouponFixed, Value: 9999, IsActive: true}
	q, _ = BuildQuote(p, "ETB", over, now, 0)
	if q.Final != 0 || !q.Free || q.Discount != 700 {
		t.Errorf("covering coupon must clamp and be free: %+v", q)
	}
	full := &domain.Coupon{Code: "FREE", Kind: domain.CouponPercent, Value: 100, IsActive: true}
	if q, _ = BuildQuote(p, "ETB", full, now, 0); !q.Free {
		t.Error("100% coupon must be free")
	}
}

func TestCouponValidation(t *testing.T) {
	p := plan()
	now := ts("2026-10-15T00:00:00Z")
	base := domain.Coupon{Code: "X", Kind: domain.CouponPercent, Value: 10, IsActive: true}
	bad := func(c domain.Coupon, red int, want error) {
		t.Helper()
		if _, err := BuildQuote(p, "ETB", &c, now, red); !errors.Is(err, want) {
			t.Errorf("want %v got %v", want, err)
		}
	}
	c := base
	c.IsActive = false
	bad(c, 0, ErrCouponExpired)
	c = base
	c.EndsAt = "2026-10-14T00:00:00Z"
	bad(c, 0, ErrCouponExpired)
	c = base
	c.StartsAt = "2026-10-16T00:00:00Z"
	bad(c, 0, ErrCouponExpired)
	c = base
	c.MaxRedemptions, c.Redeemed = 5, 5
	bad(c, 0, ErrCouponExhausted)
	c = base
	c.PerStudentLimit = 1
	bad(c, 1, ErrCouponStudentLimit)
	c = base
	c.ProgramIDs = []string{"training"}
	bad(c, 0, ErrCouponInvalid)
	c = base
	c.ProgramIDs = []string{"grade-12"}
	if _, err := BuildQuote(p, "ETB", &c, now, 0); err != nil {
		t.Errorf("scoped coupon should apply: %v", err)
	}
	c = base
	c.PlanIDs = []string{"other"}
	bad(c, 0, ErrCouponInvalid)
}

func TestPlansForProgram(t *testing.T) {
	now := ts("2026-10-15T00:00:00Z")
	a := domain.PricePlan{ID: "a", Name: "B", ProgramIDs: []string{"grade-12"}, IsActive: true, SortOrder: 2}
	b := domain.PricePlan{ID: "b", Name: "A", AllPrograms: true, IsActive: true, SortOrder: 1}
	c := domain.PricePlan{ID: "c", ProgramIDs: []string{"training"}, IsActive: true}
	d := domain.PricePlan{ID: "d", ProgramIDs: []string{"grade-12"}, IsActive: false}
	e := domain.PricePlan{ID: "e", ProgramIDs: []string{"grade-12"}, IsActive: true, VisibleFrom: "2026-11-01T00:00:00Z"}
	got := PlansForProgram([]domain.PricePlan{a, b, c, d, e}, "grade-12", now)
	if len(got) != 2 || got[0].ID != "b" || got[1].ID != "a" {
		t.Errorf("got %+v", got)
	}
}

func TestRebuildEntitlements(t *testing.T) {
	g1 := Grant{ProgramIDs: []string{"grade-12"}, PlanID: "p1", Source: domain.EntitlementSourcePayment,
		ApprovedAt: ts("2026-01-01T00:00:00Z"), Validity: domain.Validity{Type: domain.ValidityDays, Days: 30}}
	// early renewal 10 days later must ADD 30 days to the existing expiry
	g2 := g1
	g2.ApprovedAt = ts("2026-01-11T00:00:00Z")
	got := RebuildEntitlements("s1", []Grant{g2, g1}, nil) // order must not matter
	if len(got) != 1 || got[0].ExpiresAt != "2026-03-02T00:00:00Z" {
		t.Fatalf("early renewal: %+v", got)
	}
	// lapsed renewal restarts from approval time
	g3 := g1
	g3.ApprovedAt = ts("2026-06-01T00:00:00Z")
	got = RebuildEntitlements("s1", []Grant{g1, g3}, nil)
	if got[0].ExpiresAt != "2026-07-01T00:00:00Z" {
		t.Errorf("lapsed: %+v", got)
	}
	// fixed_end cohort + bundle
	fe := Grant{ProgramIDs: []string{"grade-12", "entrance-exam"}, PlanID: "b", Source: "payment",
		ApprovedAt: ts("2026-02-01T00:00:00Z"), Validity: domain.Validity{Type: domain.ValidityFixedEnd, EndsAt: "2027-07-15T00:00:00Z"}}
	got = RebuildEntitlements("s1", []Grant{g1, fe}, nil)
	if len(got) != 2 || got[0].ProgramID != "entrance-exam" || got[0].ExpiresAt != "2027-07-15T00:00:00Z" || got[1].ExpiresAt != "2027-07-15T00:00:00Z" {
		t.Errorf("fixed end bundle: %+v", got)
	}
	// all-access expands to existing programs; lifetime never expires and sticks
	all := Grant{PlanID: "all", Source: "admin_grant", ApprovedAt: ts("2026-03-01T00:00:00Z"), Validity: domain.Validity{Type: domain.ValidityLifetime}}
	got = RebuildEntitlements("s1", []Grant{all, g1}, []string{"grade-12", "training"})
	for _, e := range got {
		if e.ExpiresAt != "" {
			t.Errorf("lifetime must have empty expiry: %+v", e)
		}
	}
	if len(got) != 2 {
		t.Errorf("all-access should cover both programs: %+v", got)
	}
	// revoke == grant removed -> entitlement disappears; idempotent rebuild
	if got = RebuildEntitlements("s1", nil, nil); len(got) != 0 {
		t.Error("no grants must give no entitlements")
	}
	a1 := RebuildEntitlements("s1", []Grant{g1, g2}, nil)
	a2 := RebuildEntitlements("s1", []Grant{g1, g2}, nil)
	if a1[0] != a2[0] {
		t.Error("rebuild must be deterministic")
	}
}
