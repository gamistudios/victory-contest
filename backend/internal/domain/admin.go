package domain

import "github.com/golang-jwt/jwt/v5"

type Admin struct {
	ID         string `json:"id"          dynamodbav:"id"`
	Email      string `json:"email"       dynamodbav:"email"`
	IsApproved bool   `json:"is_approved" dynamodbav:"is_approved"`
	Name       string `json:"name"        dynamodbav:"name"`
	Password   string `json:"-"           dynamodbav:"password"`
}

type CustomClaims struct {
	UserID string `json:"user_id"`
	// Role distinguishes student sessions (S2) from admin ones; admin tokens
	// predate it and carry no claim, which studentAuth treats as "not a
	// student" (omitempty keeps their payloads byte-identical).
	Role string `json:"role,omitempty"`
	jwt.RegisteredClaims
}

// Dashboard Response Data Structures

type DashboardStatsResponse struct {
	Overview       OverviewStats   `json:"overview" validate:"required"`
	UserStats      UserStats       `json:"user_stats" validate:"required"`
	ContestStats   ContestStats    `json:"contest_stats" validate:"required"`
	PageViewStats  PageViewStats   `json:"page_view_stats" validate:"required"`
	RecentActivity []RecentContest `json:"recent_activity" validate:"required"`
	// Additive deep-system stats (client task 4): the question bank and the
	// payments ledger, aggregated in the same single-pass scans as everything
	// else. Both are optional on the wire so older clients that predate them
	// still decode the response.
	QuestionStats QuestionStats `json:"question_stats"`
	PaymentStats  PaymentStats  `json:"payment_stats"`
	// GeneratedAt is the UTC RFC 3339 timestamp at which the request-time
	// full-scan aggregation ran, so the admin UI can show data freshness
	// (additive field, client issue #5).
	GeneratedAt string `json:"generated_at"`
}

type OverviewStats struct {
	TotalUsers    StatWithTrend `json:"total_users" validate:"required"`
	TotalContests StatWithTrend `json:"total_contests" validate:"required"`
	Revenue       StatWithTrend `json:"revenue" validate:"required"`
	Registrations StatWithTrend `json:"registrations" validate:"required"`
}

type StatWithTrend struct {
	Value  string `json:"value" validate:"required"`
	Trend  string `json:"trend" validate:"required,oneof=up down neutral"`
	Change string `json:"change" validate:"required"`
	Data   []int  `json:"data" validate:"required"`
}

type UserStats struct {
	ByCity      []CityDistribution  `json:"by_city" validate:"required"`
	ByGender    GenderDistribution  `json:"by_gender" validate:"required"`
	ByGrade     []GradeDistribution `json:"by_grade" validate:"required"`
	GrowthTrend []int               `json:"growth_trend" validate:"required"`
	// Additive deep-stats (client issue #5):
	// participation per grade and the top schools by submission activity.
	GradeParticipation []GradeParticipationStat  `json:"grade_participation"`
	TopSchools         []SchoolParticipationStat `json:"top_schools_by_participation"`
}

type CityDistribution struct {
	City       string  `json:"city" validate:"required"`
	Count      int     `json:"count" validate:"min=0"`
	Percentage float64 `json:"percentage" validate:"min=0,max=100"`
}

type GenderDistribution struct {
	Male   int `json:"male" validate:"min=0"`
	Female int `json:"female" validate:"min=0"`
	Other  int `json:"other" validate:"min=0"`
	// Unknown holds every student whose stored gender is empty, malformed or
	// an unrecognized value (issue #5) so male+female+other+unknown always
	// equals Total (and Total equals the number of students).
	Unknown int `json:"unknown" validate:"min=0"`
	Total   int `json:"total" validate:"min=0"`
}

// GradeParticipationStat is the share of students in one grade that have at
// least one submission (client issue #5).
type GradeParticipationStat struct {
	Grade             string  `json:"grade" validate:"required"`
	Students          int     `json:"students" validate:"min=0"`
	Participating     int     `json:"participating_students" validate:"min=0"`
	ParticipationRate float64 `json:"participation_rate" validate:"min=0,max=100"`
}

// SchoolParticipationStat is one school's submission activity; the dashboard
// returns the top 10 by participating students (client issue #5).
type SchoolParticipationStat struct {
	School            string  `json:"school" validate:"required"`
	City              string  `json:"city"`
	Students          int     `json:"students" validate:"min=0"`
	Participating     int     `json:"participating_students" validate:"min=0"`
	ParticipationRate float64 `json:"participation_rate" validate:"min=0,max=100"`
	Submissions       int     `json:"submissions" validate:"min=0"`
}

type GradeDistribution struct {
	Grade      string  `json:"grade" validate:"required"`
	Count      int     `json:"count" validate:"min=0"`
	Percentage float64 `json:"percentage" validate:"min=0,max=100"`
}

type ContestStats struct {
	ParticipationData   []int         `json:"participation_data" validate:"required"`
	StatusDistribution  StatusStats   `json:"status_distribution" validate:"required"`
	SubjectDistribution []SubjectStat `json:"subject_distribution" validate:"required"`
	// Additive deep-stats (client issue #5): score quality per subject and an
	// overall submission summary computed from the already-fetched scans.
	SubjectScores   []SubjectScoreStat `json:"subject_scores"`
	SubmissionStats SubmissionStats    `json:"submission_stats"`
}

// QuestionStats summarizes the stored question bank (client task 4), computed
// in a single in-memory pass over one GetAllQuestions scan so it adds no extra
// round-trips to the dashboard.
type QuestionStats struct {
	Total            int          `json:"total" validate:"min=0"`
	BySubject        []SubjectStat `json:"by_subject"`
	ByGrade          []GradeDistribution `json:"by_grade"`
	WithExplanation int          `json:"with_explanation" validate:"min=0"`
	WithImage        int          `json:"with_image" validate:"min=0"`
}

// PaymentStats summarizes the payments ledger (client task 4): a status
// breakdown, approved revenue, and a 30-day request trend, all derived from
// the one ListAll scan the dashboard already performs.
type PaymentStats struct {
	Total          int     `json:"total" validate:"min=0"`
	Pending        int     `json:"pending" validate:"min=0"`
	Approved       int     `json:"approved" validate:"min=0"`
	Rejected       int     `json:"rejected" validate:"min=0"`
	ApprovedRevenue float64 `json:"approved_revenue"`
	ByStatus       []PaymentStatusStat `json:"by_status"`
	Trend          []int   `json:"trend" validate:"required"`
}

// PaymentStatusStat is one bucket of the payments status distribution.
type PaymentStatusStat struct {
	Status     string  `json:"status"`
	Count      int     `json:"count" validate:"min=0"`
	Percentage float64 `json:"percentage" validate:"min=0,max=100"`
}

// SubjectScoreStat carries average and median submission scores for one
// contest subject (client issue #5).
type SubjectScoreStat struct {
	Subject     string  `json:"subject" validate:"required"`
	Submissions int     `json:"submissions" validate:"min=0"`
	Average     float64 `json:"average_score"`
	Median      float64 `json:"median_score"`
}

// SubmissionStats summarizes the submissions table. domain.Submission has no
// status field, so the honest distribution available is timestamped vs
// missing-timestamp plus score aggregates (client issue #5).
type SubmissionStats struct {
	Total            int     `json:"total" validate:"min=0"`
	Submitted        int     `json:"submitted" validate:"min=0"`
	MissingTimestamp int     `json:"missing_timestamp" validate:"min=0"`
	UniqueStudents   int     `json:"unique_students" validate:"min=0"`
	AverageScore     float64 `json:"average_score"`
	MedianScore      float64 `json:"median_score"`
}

type StatusStats struct {
	Active    int `json:"active" validate:"min=0"`
	Completed int `json:"completed" validate:"min=0"`
	Upcoming  int `json:"upcoming" validate:"min=0"`
}

type SubjectStat struct {
	Subject    string  `json:"subject" validate:"required"`
	Count      int     `json:"count" validate:"min=0"`
	Percentage float64 `json:"percentage" validate:"min=0,max=100"`
}

type RecentContest struct {
	ID            string `json:"id" validate:"required"`
	Title         string `json:"title" validate:"required"`
	Status        string `json:"status" validate:"required,oneof=Online Offline"`
	Users         int    `json:"users" validate:"min=0"`
	Subject       string `json:"subject" validate:"required"`
	QuestionCount int    `json:"noquestion" validate:"min=0"`
	TotalTime     string `json:"totaltime" validate:"required"`
	Date          string `json:"date" validate:"required"`
}
