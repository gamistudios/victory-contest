package domain

// AISettings is the single-row AI feature configuration (table "ai_settings",
// item key id = AISettingsID). One row governs every student AI surface; it
// deliberately is NOT per provider. A missing row reads back as the zero
// value, i.e. require_premium = false (today's public behavior).
type AISettings struct {
	ID             string `json:"id"              dynamodbav:"id"`
	RequirePremium bool   `json:"require_premium" dynamodbav:"require_premium"`
}

// AISettingsID is the fixed primary key of the single settings row.
const AISettingsID = "ai"
