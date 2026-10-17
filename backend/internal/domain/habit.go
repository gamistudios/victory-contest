package domain

// Training & Habit Development (plan §5.10). Habit progress is private to the
// student and visible to admins only: there are no points, no price and no
// leaderboard row (decision 16).

const (
	HabitAccessFree    = "free"
	HabitAccessPremium = "premium"

	// HabitDefaultTrackDays is the length of a track that does not set its own
	// (and of every track created before tracks became variable-length).
	HabitDefaultTrackDays = 30
	// HabitMaxTrackDays caps how long an admin may make a track.
	HabitMaxTrackDays = 365
	// HabitTrackDays is kept for older callers; use HabitPlan.Length().
	HabitTrackDays = HabitDefaultTrackDays

	// HabitBadgeType marks achievements earned from streaks; they stay private.
	HabitBadgeType = "habit_streak"
	// NotificationTypeHabit tags nudges and streak-at-risk reminders.
	NotificationTypeHabit = "habit"
)

// HabitStreakMilestones are the streak lengths that earn a personal badge on
// any track long enough to reach them. A track's own length is always added
// by HabitMilestones, so finishing a 5- or 45-day track earns its badge too.
var HabitStreakMilestones = []int{7, 14, 30, 60, 90, 180, 365}

// HabitMilestones returns the ascending badge streaks for a track of the given length.
func HabitMilestones(length int) []int {
	out := []int{}
	hasLen := false
	for _, m := range HabitStreakMilestones {
		if m <= length {
			out = append(out, m)
			if m == length {
				hasLen = true
			}
		}
	}
	if !hasLen && length > 0 {
		out = append(out, length)
	}
	return out
}

type HabitItem struct {
	ID    string `json:"id"    dynamodbav:"id"`
	Label string `json:"label" dynamodbav:"label"`
}

type HabitDay struct {
	Day   int         `json:"day"   dynamodbav:"day"` // 1..plan length
	Title string      `json:"title" dynamodbav:"title"`
	Items []HabitItem `json:"items" dynamodbav:"items"`
}

// HabitPlan is an admin-authored track of DaysCount days (any length from 1 to
// HabitMaxTrackDays). Table habit_plans.
type HabitPlan struct {
	ID        string     `json:"id"         dynamodbav:"id"`
	ProgramID string     `json:"program_id" dynamodbav:"program_id"`
	Title     string     `json:"title"      dynamodbav:"title"`
	Days      []HabitDay `json:"days"       dynamodbav:"days"`
	Access    string     `json:"access"     dynamodbav:"access"` // free | premium
	IsActive  bool       `json:"is_active"  dynamodbav:"is_active"`
	// DaysCount is the admin-chosen length of the track. 0 (plans stored before
	// this field existed) means the default of 30 days.
	DaysCount int `json:"days_count" dynamodbav:"days_count"`
}

// Length is the number of days in the track, applying the legacy default.
func (p *HabitPlan) Length() int {
	if p == nil || p.DaysCount <= 0 {
		return HabitDefaultTrackDays
	}
	return p.DaysCount
}

// HabitLog is one student's run of one plan. Table habit_logs,
// id = {studentId}#{planId}.
type HabitLog struct {
	ID            string              `json:"id"             dynamodbav:"id"`
	StudentID     string              `json:"student_id"     dynamodbav:"student_id"`
	PlanID        string              `json:"plan_id"        dynamodbav:"plan_id"`
	StartDate     string              `json:"start_date"     dynamodbav:"start_date"` // Addis date, YYYY-MM-DD
	Done          map[string][]string `json:"done"           dynamodbav:"done"`       // "2026-11-03" -> item ids
	CurrentStreak int                 `json:"current_streak" dynamodbav:"current_streak"`
	BestStreak    int                 `json:"best_streak"    dynamodbav:"best_streak"`
	TotalDone     int                 `json:"total_done"     dynamodbav:"total_done"`
	LastActiveAt  string              `json:"last_active_at" dynamodbav:"last_active_at"`
}

// HabitLogID builds the deterministic primary key.
func HabitLogID(studentID, planID string) string { return studentID + "#" + planID }
