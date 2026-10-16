package domain

// Attempt is the single recorded try of a student at an assessment
// (plan §5.4.2). The id is deterministic: {contestId}#{studentId}#1.
type Attempt struct {
	ID        string `json:"id"         dynamodbav:"id"`
	ContestID string `json:"contest_id" dynamodbav:"contest_id"`
	StudentID string `json:"student_id" dynamodbav:"student_id"`

	// Snapshot of the assessment scope plus the student's stream at start time.
	Scope           *Scope `json:"scope,omitempty"             dynamodbav:"scope,omitempty"`
	StudentStreamID string `json:"student_stream_id,omitempty" dynamodbav:"student_stream_id,omitempty"`

	Mode   string `json:"mode"   dynamodbav:"mode"`
	Status string `json:"status" dynamodbav:"status"`

	// Server time only, RFC3339 UTC.
	StartedAt   string `json:"started_at"             dynamodbav:"started_at"`
	ExpiresAt   string `json:"expires_at"             dynamodbav:"expires_at"`
	SubmittedAt string `json:"submitted_at,omitempty" dynamodbav:"submitted_at,omitempty"`

	Answers        map[string]int `json:"answers,omitempty" dynamodbav:"answers,omitempty"`
	AnswersVersion int            `json:"answers_version"   dynamodbav:"answers_version"`
	Flagged        []string       `json:"flagged,omitempty" dynamodbav:"flagged,omitempty"`
	Order          []string       `json:"order,omitempty"   dynamodbav:"order,omitempty"`

	Correct int `json:"correct" dynamodbav:"correct"`
	Total   int `json:"total"   dynamodbav:"total"`
	Points  int `json:"points"  dynamodbav:"points"`

	IsLate         bool `json:"is_late"         dynamodbav:"is_late"`
	PenaltyPercent int  `json:"penalty_percent" dynamodbav:"penalty_percent"`
	PenaltyWaived  bool `json:"penalty_waived"  dynamodbav:"penalty_waived"`

	SubmissionID    string `json:"submission_id,omitempty" dynamodbav:"submission_id,omitempty"`
	DurationSeconds int    `json:"duration_seconds"        dynamodbav:"duration_seconds"`

	Excluded       bool   `json:"excluded"                  dynamodbav:"excluded"`
	ExcludedReason string `json:"excluded_reason,omitempty" dynamodbav:"excluded_reason,omitempty"`
}

const (
	AttemptInProgress    = "in_progress"
	AttemptSubmitted     = "submitted"
	AttemptAutoSubmitted = "auto_submitted"
	AttemptAbandoned     = "abandoned"
)

// AttemptID builds the deterministic first-attempt id.
func AttemptID(contestID, studentID string) string {
	return contestID + "#" + studentID + "#1"
}

// Finalised reports whether the attempt has left in_progress.
func (a Attempt) Finalised() bool { return a.Status != AttemptInProgress && a.Status != "" }

// Label derives the admin-facing label (plan §5.4.2).
func (a Attempt) Label() string {
	switch {
	case a.Excluded:
		return "excluded"
	case a.Status == AttemptAbandoned:
		return "abandoned"
	case a.Status == AttemptAutoSubmitted:
		return "auto_submitted"
	case a.IsLate:
		return "late"
	case a.Status == AttemptSubmitted:
		return "on_time"
	}
	return "in_progress"
}
