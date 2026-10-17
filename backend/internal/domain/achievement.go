package domain

type Achievement struct {
	ID          string  `json:"id"           dynamodbav:"id"`
	Earned      string  `json:"earned"       dynamodbav:"earned"`
	Name        string  `json:"name"         dynamodbav:"name"`
	Description string  `json:"description"  dynamodbav:"description"`
	Type        string  `json:"type"         dynamodbav:"type"`
	EarnedDate  string  `json:"earned_date"  dynamodbav:"earned_date"`
	Rarity      string  `json:"rarity"       dynamodbav:"rarity"`
	Progress    float64 `json:"progress"     dynamodbav:"progress"`
	// StudentID owns the badge (the by-student query already filters on it).
	StudentID string `json:"student_id,omitempty" dynamodbav:"student_id,omitempty"`
}
