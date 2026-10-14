package domain

// Pricing domain (plan §5.12). Payments stay manual bank transfer + Telegram
// Stars (decision 23); this model is independent of how money moves.

const (
	CurrencyETB = "ETB" // amount in santim (1/100 birr)
	CurrencyXTR = "XTR" // whole Telegram Stars

	ValidityDays     = "days"
	ValidityFixedEnd = "fixed_end"
	ValidityLifetime = "lifetime"

	CouponPercent = "percent" // 1-100, any currency
	CouponFixed   = "fixed"   // ETB only, in santim

	EntitlementSourcePayment    = "payment"
	EntitlementSourceAdminGrant = "admin_grant"
	EntitlementSourceCouponFree = "coupon_free"

	// DefaultGraceDays: access continues this long after expiry (decision 20).
	DefaultGraceDays = 3
)

type Money struct {
	Currency string `json:"currency" dynamodbav:"currency"`
	Amount   int64  `json:"amount"   dynamodbav:"amount"`
}

type Validity struct {
	Type   string `json:"type"              dynamodbav:"type"` // days | fixed_end | lifetime
	Days   int    `json:"days,omitempty"    dynamodbav:"days,omitempty"`
	EndsAt string `json:"ends_at,omitempty" dynamodbav:"ends_at,omitempty"` // RFC3339 for fixed_end
}

type Sale struct {
	Prices   []Money `json:"prices"    dynamodbav:"prices"`
	StartsAt string  `json:"starts_at" dynamodbav:"starts_at"`
	EndsAt   string  `json:"ends_at"   dynamodbav:"ends_at"`
}

// PricePlan is something a student can buy: one program, a bundle, or all
// programs (including ones created later). Table price_plans.
type PricePlan struct {
	ID           string   `json:"id"            dynamodbav:"id"`
	Name         string   `json:"name"          dynamodbav:"name"`
	Description  string   `json:"description"   dynamodbav:"description"`
	ProgramIDs   []string `json:"program_ids"   dynamodbav:"program_ids"`
	AllPrograms  bool     `json:"all_programs"  dynamodbav:"all_programs"`
	Validity     Validity `json:"validity"      dynamodbav:"validity"`
	Prices       []Money  `json:"prices"        dynamodbav:"prices"`      // at most one per currency
	ListPrices   []Money  `json:"list_prices"   dynamodbav:"list_prices"` // optional strike-through
	Sale         *Sale    `json:"sale,omitempty" dynamodbav:"sale,omitempty"`
	Highlights   []string `json:"highlights"    dynamodbav:"highlights"`
	Badge        string   `json:"badge"         dynamodbav:"badge"`
	IsActive     bool     `json:"is_active"     dynamodbav:"is_active"`
	VisibleFrom  string   `json:"visible_from"  dynamodbav:"visible_from"`
	VisibleUntil string   `json:"visible_until" dynamodbav:"visible_until"`
	SortOrder    int      `json:"sort_order"    dynamodbav:"sort_order"`
	UpdatedBy    string   `json:"updated_by"    dynamodbav:"updated_by"`
	UpdatedAt    string   `json:"updated_at"    dynamodbav:"updated_at"`
}

// Coupon is created by admins (decision 21). Table coupons.
type Coupon struct {
	ID              string   `json:"id"                dynamodbav:"id"`
	Code            string   `json:"code"              dynamodbav:"code"` // unique, case-insensitive (stored upper-case)
	Kind            string   `json:"kind"              dynamodbav:"kind"`
	Value           int64    `json:"value"             dynamodbav:"value"`
	PlanIDs         []string `json:"plan_ids"          dynamodbav:"plan_ids"`
	ProgramIDs      []string `json:"program_ids"       dynamodbav:"program_ids"`       // both empty = applies to everything
	MaxRedemptions  int      `json:"max_redemptions"   dynamodbav:"max_redemptions"`   // 0 = unlimited
	PerStudentLimit int      `json:"per_student_limit" dynamodbav:"per_student_limit"` // 0 = unlimited
	Redeemed        int      `json:"redeemed"          dynamodbav:"redeemed"`
	StartsAt        string   `json:"starts_at"         dynamodbav:"starts_at"`
	EndsAt          string   `json:"ends_at"           dynamodbav:"ends_at"`
	IsActive        bool     `json:"is_active"         dynamodbav:"is_active"`
}

// Entitlement is what a student currently has for one program. Table
// entitlements, id = {studentId}#{programId}. It is a rebuildable cache.
type Entitlement struct {
	ID         string `json:"id"           dynamodbav:"id"`
	StudentID  string `json:"student_id"   dynamodbav:"student_id"`
	ProgramID  string `json:"program_id"   dynamodbav:"program_id"`
	ExpiresAt  string `json:"expires_at"   dynamodbav:"expires_at"` // empty = lifetime
	Source     string `json:"source"       dynamodbav:"source"`
	LastPlanID string `json:"last_plan_id" dynamodbav:"last_plan_id"`
}

// EntitlementID builds the deterministic primary key.
func EntitlementID(studentID, programID string) string { return studentID + "#" + programID }
