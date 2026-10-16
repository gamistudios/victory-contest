package domain

import (
	"time"
)

type Submission struct {
	ID              string                        `json:"id"     dynamodbav:"id"`
	ContestID       string                        `json:"contest_id"        dynamodbav:"contest_id"`
	StudentID       string                        `json:"student_id"        dynamodbav:"student_id"`
	Contest         Contest                       `json:"contest"           dynamodbav:"-"`
	Student         StudentSub                    `json:"student"        dynamodbav:"student"`
	Score           float64                       `json:"score"             dynamodbav:"score"`
	MissedQuestions []SubmissionMissedQuestionDto `json:"missed_questions"  dynamodbav:"missed_questions"`
	SubmissionTime  time.Time                     `json:"submission_time"   dynamodbav:"submission_time"`
	TimeSpend       string                        `json:"time_spend"        dynamodbav:"time_spend"`

	// Phase 2 (plan §5.4.2). Score stays the raw correct count; leaderboards use Points.
	Scope           *Scope `json:"scope,omitempty"            dynamodbav:"scope,omitempty"`
	AttemptID       string `json:"attempt_id,omitempty"       dynamodbav:"attempt_id,omitempty"`
	StartedAt       string `json:"started_at,omitempty"       dynamodbav:"started_at,omitempty"`
	IsLate          bool   `json:"is_late"                    dynamodbav:"is_late"`
	PenaltyPercent  int    `json:"penalty_percent"            dynamodbav:"penalty_percent"`
	Points          int    `json:"points"                     dynamodbav:"points"`
	DurationSeconds int    `json:"duration_seconds"           dynamodbav:"duration_seconds"`
}

type SubmissionMissedQuestionDto struct {
	ID             string `json:"id"`
	SelectedAnswer int    `json:"selected_answer"`
}
type SubmissionDto struct {
	ContestID string     `json:"contest_id"`
	Student   StudentSub `json:"student"`
	// Score is the client-computed score. It is NEVER trusted: the server
	// recomputes the official score and only logs a mismatch (README §9 #12).
	Score           float64                       `json:"score"`
	MissedQuestions []SubmissionMissedQuestionDto `json:"missed_questions"`
	// Answers is the full answer sheet (one entry per contest question,
	// selected_answer = -1 for skipped). When present, the server grades the
	// submission itself against the stored correct answers instead of trusting
	// the client's missed list — required now that live contests no longer
	// expose answers to students (README §9 #11). Legacy clients that only
	// send missed_questions keep working (empty Answers = old protocol).
	Answers   []SubmissionMissedQuestionDto `json:"answers,omitempty"`
	TimeSpend string                        `json:"time_spend"`
}

type StudentSub struct {
	ID     string `json:"student_id" dynamodbav:"student_id"`
	ImgURL string `json:"imgurl" dynamodbav:"imgurl"`
	Name   string `json:"name" dynamodbav:"name"`
}
type LeaderboardEntry struct {
	Rank             int    `json:"rank"`
	UserID           string `json:"user_id"`
	UserName         string `json:"user_name"`
	Score            int    `json:"score"`
	CorrectAnswers   int    `json:"correct_answers"`
	TotalQuestions   int    `json:"total_questions"`
	TimeTaken        string `json:"time_taken"` // Formatted as HH:MM:SS or MM:SS
	ImageURL         string `json:"imgurl"`
	TimeTakenSeconds int    `json:"time_taken_seconds"`
}
type LeaderboardForContestEntry struct {
	UserId         string `json:"user_id"`
	UserName       string `json:"user_name"`
	Score          int    `json:"score"`
	CorrectAnswers int    `json:"correct_answers"`
	TotalQuestions int    `json:"total_questions"`
	TimeTaken      string `json:"time_taken"`
	ImgURL         string `json:"imgurl"`
}
type Editorial struct {
	Question
	UserAnswer int  `json:"user_answer"`
	IsCorrect  bool `json:"is_correct"`
}
