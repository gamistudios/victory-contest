package domain

// Training & Habit Development (plan §5.10). Habit progress is private to the
// student and visible to admins only: there are no points, no price and no
// leaderboard row (decision 16).

const (
	HabitAccessFree    = "free"
	HabitAccessPremium = "premium"

	// HabitTrackDays is the length of every track.
	HabitTrackDays = 30

	// HabitBadgeType marks achievements earned from streaks; they stay private.
	HabitBadgeType = "habit_streak"
	// NotificationTypeHabit tags nudges and streak-at-risk reminders.
	NotificationTypeHabit = "habit"
)

// HabitStreakMilestones are the streak lengths that earn a personal badge.
var HabitStreakMilestones = []int{7, 14, 30}

type HabitItem struct {
	ID    string `json:"id"    dynamodbav:"id"`
	Label string `json:"label" dynamodbav:"label"`
}

type HabitDay struct {
	Day   int         `json:"day"   dynamodbav:"day"` // 1..30
	Title string      `json:"title" dynamodbav:"title"`
	Items []HabitItem `json:"items" dynamodbav:"items"`
}

// HabitPlan is an admin-authored 30-day track. Table habit_plans.
type HabitPlan struct {
	ID        string     `json:"id"         dynamodbav:"id"`
	ProgramID string     `json:"program_id" dynamodbav:"program_id"`
	Title     string     `json:"title"      dynamodbav:"title"`
	Days      []HabitDay `json:"days"       dynamodbav:"days"`
	Access    string     `json:"access"     dynamodbav:"access"` // free | premium
	IsActive  bool       `json:"is_active"  dynamodbav:"is_active"`
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
