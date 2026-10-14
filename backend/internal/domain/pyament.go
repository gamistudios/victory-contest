package domain

import "time"

type PaymentRequest struct {
	ID                string `json:"id" dynamodbav:"id"`
	UserID            string `json:"user_id" dynamodbav:"user_id"`
	FullName          string `json:"fullName" dynamodbav:"full_name"`
	BankName          string `json:"bankName" dynamodbav:"bank_name"`
	BillScreenshotURL string `json:"billScreenshotUrl" dynamodbav:"bill_screenshot_url"`
	// Amount is the transferred value in ETB (Ethiopian bank transfer);
	// rows written before issue #37 carry no attribute and read back as 0.
	Amount          float64       `json:"amount,omitempty" dynamodbav:"amount,omitempty"`
	Status          PaymentStatus `json:"status" dynamodbav:"status"`
	RejectionReason string        `json:"rejectionReason,omitempty" dynamodbav:"rejection_reason"`
	LegacyReason    string        `json:"-" dynamodbav:"reason,omitempty"` // obsolete `reason` attr written by older UpdateStatus builds (README #43); read-only fallback into RejectionReason, never written
	CreatedAt       time.Time     `json:"createdAt" dynamodbav:"created_at"`
	UpdatedAt       time.Time     `json:"updatedAt" dynamodbav:"updated_at"`
	ExpirationDate  *time.Time    `json:"expirationDate,omitempty" dynamodbav:"expirationDate,omitempty"`
	GSI1PK          string        `dynamodbav:"GSI1PK,omitempty"` // New field
	// Phase 1 plan snapshot (all optional; legacy rows read as empty and keep the 1-month rule).
	PlanID      string    `json:"plan_id,omitempty"       dynamodbav:"plan_id,omitempty"`
	CouponCode  string    `json:"coupon_code,omitempty"   dynamodbav:"coupon_code,omitempty"`
	Currency    string    `json:"currency,omitempty"      dynamodbav:"currency,omitempty"`
	FinalAmount int64     `json:"final_amount,omitempty"  dynamodbav:"final_amount,omitempty"` // minor units of Currency
	ProgramIDs  []string  `json:"program_ids,omitempty"   dynamodbav:"program_ids,omitempty"`  // programs the plan covered at purchase
	Validity    *Validity `json:"validity,omitempty"     dynamodbav:"validity,omitempty"`      // plan validity snapshot
	Revoked     bool      `json:"revoked,omitempty"       dynamodbav:"revoked,omitempty"`
}

type PaymentStatus string

const (
	StatusPending  PaymentStatus = "Pending"
	StatusApproved PaymentStatus = "Approved"
	StatusRejected PaymentStatus = "Rejected"
)

type PaymentReason struct {
	Reason string `json:"reason"`
}
