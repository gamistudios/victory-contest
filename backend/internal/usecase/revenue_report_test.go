package usecase

import (
	"testing"
	"time"

	"victory-contest-go/internal/domain"
)

// Phase 5 revenue report: the whole-birr split and the pure aggregation. These
// guard the money invariants (integer birr, refunds/grants/stars kept out of
// ETB revenue, Addis month bucketing).

func TestSplitWhole(t *testing.T) {
	cases := []struct {
		name    string
		total   int64
		progs   []string
		wantSum int64
		wantLen int
		// expected amounts in sorted-program order
		want []int64
	}{
		{"empty goes to all_programs", 500, nil, 500, 1, []int64{500}},
		{"exact split", 1000, []string{"g12", "g11"}, 1000, 2, []int64{500, 500}},
		{"remainder to first sorted", 10, []string{"c", "a", "b"}, 10, 3, []int64{4, 3, 3}},
		{"odd birr sums exactly", 1000, []string{"a", "b", "c"}, 1000, 3, []int64{334, 333, 333}},
	}
	for _, tc := range cases {
		got := splitWhole(tc.total, tc.progs)
		if len(got) != tc.wantLen {
			t.Fatalf("%s: len=%d want %d", tc.name, len(got), tc.wantLen)
		}
		var sum int64
		for i, s := range got {
			sum += s.amount
			if s.amount != tc.want[i] {
				t.Fatalf("%s: part %d = %d want %d", tc.name, i, s.amount, tc.want[i])
			}
		}
		if sum != tc.wantSum {
			t.Fatalf("%s: parts sum to %d want %d", tc.name, sum, tc.wantSum)
		}
	}
	// programs come back in sorted key order regardless of input order.
	got := splitWhole(100, []string{"z", "a"})
	if got[0].program != "a" || got[1].program != "z" {
		t.Fatalf("splitWhole must sort program keys, got %v/%v", got[0].program, got[1].program)
	}
}

func row(key string, list []domain.RevenueRow) (domain.RevenueRow, bool) {
	for _, r := range list {
		if r.Key == key {
			return r, true
		}
	}
	return domain.RevenueRow{}, false
}

func TestBuildRevenueReport(t *testing.T) {
	ts := func(s string) time.Time { v, _ := time.Parse(time.RFC3339, s); return v }
	payments := []domain.PaymentRequest{
		// counted ETB revenue
		{ID: "p1", Status: domain.StatusApproved, PlanID: "pro", FinalAmount: 900, Currency: domain.CurrencyETB,
			ProgramIDs: []string{"g12"}, CouponCode: "newyear", UpdatedAt: ts("2026-01-15T10:00:00Z")},
		{ID: "p2", Status: domain.StatusApproved, PlanID: "bundle", FinalAmount: 1000, Currency: domain.CurrencyETB,
			ProgramIDs: []string{"g11", "g12"}, UpdatedAt: ts("2026-01-31T23:30:00Z")}, // EAT -> 2026-02
		{ID: "p7", Status: domain.StatusApproved, PlanID: "", FinalAmount: 0, Amount: 350.4, Currency: domain.CurrencyETB,
			ProgramIDs: []string{"g12"}, UpdatedAt: ts("2026-02-10T10:00:00Z")}, // legacy, whole-birr round
		// excluded from ETB revenue
		{ID: "refund", Status: domain.StatusApproved, Revoked: true, PlanID: "pro", FinalAmount: 500, Currency: domain.CurrencyETB,
			ProgramIDs: []string{"g12"}, UpdatedAt: ts("2026-02-01T10:00:00Z")},
		{ID: "grant", Status: domain.StatusApproved, BankName: adminGrantBank, ProgramIDs: []string{"g12"}, UpdatedAt: ts("2026-02-01T10:00:00Z")},
		{ID: "freecoupon", Status: domain.StatusApproved, FinalAmount: 0, CouponCode: "X", PlanID: "pro", ProgramIDs: []string{"g12"},
			UpdatedAt: ts("2026-02-01T10:00:00Z")},
		{ID: "stars", Status: domain.StatusApproved, Currency: domain.CurrencyXTR, FinalAmount: 200, PlanID: "s", ProgramIDs: []string{"g12"},
			UpdatedAt: ts("2026-02-01T10:00:00Z")},
		{ID: "pending", Status: domain.StatusPending, PlanID: "pro", FinalAmount: 9999, Currency: domain.CurrencyETB,
			ProgramIDs: []string{"g12"}, UpdatedAt: ts("2026-02-01T10:00:00Z")},
	}
	planNames := map[string]string{"pro": "Pro", "bundle": "Bundle"}
	rep := BuildRevenueReport(payments, planNames, domain.RevenueQuery{}, time.Time{}, false, time.Time{}, false, ts("2026-03-01T00:00:00Z"))

	if rep.Totals.Revenue != 2250 || rep.Totals.Payments != 3 {
		t.Fatalf("ETB totals = %+v, want revenue 2250 / payments 3", rep.Totals)
	}
	if rep.Totals.Refunded != 1 || rep.Totals.RefundedETB != 500 {
		t.Fatalf("refunds = %d/%d, want 1/500", rep.Totals.Refunded, rep.Totals.RefundedETB)
	}
	if rep.Totals.FreeGrants != 2 {
		t.Fatalf("free grants = %d, want 2 (admin grant + 100%% coupon)", rep.Totals.FreeGrants)
	}
	if rep.Totals.StarsRevenue != 200 {
		t.Fatalf("stars = %d, want 200 (kept out of ETB)", rep.Totals.StarsRevenue)
	}
	if rep.Totals.LegacyPayments != 1 {
		t.Fatalf("legacy payments = %d, want 1", rep.Totals.LegacyPayments)
	}

	// Whole-birr program split: g12 = 900 + 500 + 350, g11 = 500.
	g12, ok := row("g12", rep.ByProgram)
	if !ok || g12.Revenue != 1750 || g12.Payments != 2 {
		t.Fatalf("ByProgram g12 = %+v, want revenue 1750 / payments 2", g12)
	}
	g11, _ := row("g11", rep.ByProgram)
	if g11.Revenue != 500 {
		t.Fatalf("ByProgram g11 = %+v, want 500", g11)
	}

	// Coupons are upper-cased; blank buckets to "(no coupon)".
	if c, ok := row("NEWYEAR", rep.ByCoupon); !ok || c.Revenue != 900 {
		t.Fatalf("ByCoupon NEWYEAR = %+v (ok %v), want 900", c, ok)
	}
	if c, ok := row("", rep.ByCoupon); !ok || c.Revenue != 1350 || c.Payments != 2 {
		t.Fatalf("ByCoupon (no coupon) = %+v (ok %v), want revenue 1350 / payments 2", c, ok)
	}

	// Months bucket in Africa/Addis (UTC+3): p1 in Jan, p2+p7 in Feb, ascending.
	if len(rep.ByMonth) != 2 || rep.ByMonth[0].Key != "2026-01" || rep.ByMonth[1].Key != "2026-02" {
		t.Fatalf("ByMonth keys = %v, want chronological [2026-01 2026-02]", []string{rep.ByMonth[0].Key, rep.ByMonth[1].Key})
	}
	if rep.ByMonth[1].Revenue != 1350 {
		t.Fatalf("2026-02 revenue = %d, want 1350 (1000 + 350)", rep.ByMonth[1].Revenue)
	}

	// Plan grouping labels resolve from the plan-name map; no-plan rows say legacy.
	if pl, ok := row("pro", rep.ByPlan); !ok || pl.Label != "Pro" || pl.Revenue != 900 {
		t.Fatalf("ByPlan pro = %+v, want label Pro / 900", pl)
	}
	if pl, ok := row("legacy", rep.ByPlan); !ok || pl.Revenue != 350 {
		t.Fatalf("ByPlan legacy = %+v (ok %v), want 350", pl, ok)
	}
}

func TestBuildRevenueReportProgramFilterClampsToAssigned(t *testing.T) {
	ts := func(s string) time.Time { v, _ := time.Parse(time.RFC3339, s); return v }
	payments := []domain.PaymentRequest{
		{ID: "p2", Status: domain.StatusApproved, PlanID: "bundle", FinalAmount: 1000, Currency: domain.CurrencyETB,
			ProgramIDs: []string{"g11", "g12"}, UpdatedAt: ts("2026-01-15T10:00:00Z")},
	}
	// An admin assigned only to g12 sees only the g12 half of the bundle.
	rep := BuildRevenueReport(payments, nil, domain.RevenueQuery{ProgramIDs: []string{"g12"}}, time.Time{}, false, time.Time{}, false, ts("2026-03-01T00:00:00Z"))
	if rep.Totals.Revenue != 500 || rep.Totals.Payments != 1 {
		t.Fatalf("filtered totals = %+v, want revenue 500 / payments 1", rep.Totals)
	}
}
