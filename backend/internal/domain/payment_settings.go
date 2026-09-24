package domain

// PaymentSettings is the single-row payment-feature configuration (table
// "payment_settings", item key id = PaymentSettingsID). One global row governs
// whether students may pay with Telegram Stars; it is deliberately NOT
// per-method. A missing row reads back as the zero value, i.e.
// allow_stars = false (Stars hidden in the student UI).
type PaymentSettings struct {
	ID          string `json:"id"           dynamodbav:"id"`
	AllowStars  bool   `json:"allow_stars"  dynamodbav:"allow_stars"`
	StarsAmount int    `json:"stars_amount" dynamodbav:"stars_amount"`
}

// PaymentSettingsID is the fixed primary key of the single settings row.
const PaymentSettingsID = "payment"
