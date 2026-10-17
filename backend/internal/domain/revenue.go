package domain

// Phase 5 revenue report. Every amount is an integer number of whole ETB
// birr (the money convention): a bundle price is split across its programs
// in whole birr with the remainder given to the first programs, never in
// fractions.

// RevenueQuery selects the payments counted: approval time inside the inclusive
// date range (YYYY-MM-DD or RFC 3339, empty = open) and, optionally, only the
// share of revenue attributed to these programs.
type RevenueQuery struct {
	ProgramIDs []string
	From       string
	To         string
}

// RevenueRow is one line of a grouping.
type RevenueRow struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Payments int    `json:"payments"`
	Revenue  int64  `json:"revenue_etb"`
}

// RevenueTotals summarises the report.
type RevenueTotals struct {
	Revenue  int64 `json:"revenue_etb"`
	Payments int   `json:"payments"`
	// RefundedETB / Refunded: approved payments later revoked; not in Revenue.
	RefundedETB int64 `json:"refunded_etb"`
	Refunded    int   `json:"refunded"`
	// FreeGrants: admin grants and 100%-coupon activations (no money moved).
	FreeGrants int `json:"free_grants"`
	// StarsRevenue is Telegram Stars income in whole stars; kept apart so ETB
	// totals never mix currencies.
	StarsRevenue int64 `json:"stars_revenue_xtr"`
	// LegacyPayments counts rows from before plan snapshots, valued from the
	// student-reported transfer amount rounded to whole birr.
	LegacyPayments int `json:"legacy_payments"`
}

// RevenueReport is the full report payload.
type RevenueReport struct {
	From        string        `json:"from,omitempty"`
	To          string        `json:"to,omitempty"`
	ProgramIDs  []string      `json:"program_ids,omitempty"`
	Totals      RevenueTotals `json:"totals"`
	ByProgram   []RevenueRow  `json:"by_program"`
	ByPlan      []RevenueRow  `json:"by_plan"`
	ByCoupon    []RevenueRow  `json:"by_coupon"`
	ByMonth     []RevenueRow  `json:"by_month"`
	GeneratedAt string        `json:"generated_at"`
}
