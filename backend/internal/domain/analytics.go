package domain

// Phase 5 scope-based analytics (plan §Phase 5). The input is a ScopeFilter
// plus a date range instead of a single contest id; the source rows are the
// finalised attempts, which carry the assessment Scope snapshot and the
// student's stream at start time.

// PassMarkPercent is the score at or above which an attempt counts as passed
// (same 50% line the per-contest statistics use).
const PassMarkPercent = 50.0

// AnalyticsQuery is one analytics request: the shared ScopeFilter and an
// optional inclusive date range (YYYY-MM-DD or RFC 3339; empty = open).
type AnalyticsQuery struct {
	Filter ScopeFilter
	From   string
	To     string
}

// AnalyticsTotals summarises every attempt in the query.
type AnalyticsTotals struct {
	Attempts      int     `json:"attempts"`
	Students      int     `json:"students"`
	AvgPercent    float64 `json:"avg_percent"`
	MedianPercent float64 `json:"median_percent"`
	PassRate      float64 `json:"pass_rate"`
	TotalPoints   int     `json:"total_points"` // integer points, never fractional
}

// AnalyticsBucket is one row of a breakdown (program, stream, subject, region).
type AnalyticsBucket struct {
	Key        string  `json:"key"`
	ProgramID  string  `json:"program_id,omitempty"`
	StreamID   string  `json:"stream_id,omitempty"`
	SubjectID  string  `json:"subject_id,omitempty"`
	Region     string  `json:"region,omitempty"`
	Attempts   int     `json:"attempts"`
	Students   int     `json:"students"`
	AvgPercent float64 `json:"avg_percent"`
	PassRate   float64 `json:"pass_rate"`
	AvgPoints  float64 `json:"avg_points"`
}

// DistributionBin is a 10-point score band; the last band (90-100) includes 100.
type DistributionBin struct {
	From  int `json:"from"`
	To    int `json:"to"`
	Count int `json:"count"`
}

// CompetencyCell is mastery for one subject/chapter within one program:
// correct answers over answered questions across the matching attempts.
// An empty ChapterID means attempts tagged to the subject as a whole.
type CompetencyCell struct {
	ProgramID string  `json:"program_id"`
	SubjectID string  `json:"subject_id"`
	ChapterID string  `json:"chapter_id,omitempty"`
	Attempts  int     `json:"attempts"`
	Students  int     `json:"students"`
	Correct   int     `json:"correct"`
	Total     int     `json:"total"`
	Mastery   float64 `json:"mastery"` // 0-100, one decimal
}

// ScopeAnalytics is the full analytics payload; the single-section endpoints
// return the matching slice of it.
type ScopeAnalytics struct {
	From         string            `json:"from,omitempty"`
	To           string            `json:"to,omitempty"`
	ProgramIDs   []string          `json:"program_ids,omitempty"`
	StreamIDs    []string          `json:"stream_ids,omitempty"`
	SubjectID    string            `json:"subject_id,omitempty"`
	ChapterID    string            `json:"chapter_id,omitempty"`
	Totals       AnalyticsTotals   `json:"totals"`
	ByProgram    []AnalyticsBucket `json:"by_program"`
	ByStream     []AnalyticsBucket `json:"by_stream"`
	BySubject    []AnalyticsBucket `json:"by_subject"`
	ByRegion     []AnalyticsBucket `json:"by_region"`
	Distribution []DistributionBin `json:"distribution"`
	Competency   []CompetencyCell  `json:"competency"`
	// Summary is a short rule-based narrative (the optional AI summary is
	// stubbed: no model call, Source says so).
	Summary       string `json:"summary"`
	SummarySource string `json:"summary_source"`
	GeneratedAt   string `json:"generated_at"`
}
