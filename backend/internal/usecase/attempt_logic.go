package usecase

import (
	"errors"
	"math"
	"time"

	"victory-contest-go/internal/domain"
)

// AttemptGrace is the network-latency allowance on autosave/submit and the
// sweeper lag before an expired attempt is auto-finalised (plan §5.4.2).
const AttemptGrace = 30 * time.Second

var (
	ErrAlreadyAttempted = errors.New("already_attempted")
	ErrNotOpenYet       = errors.New("assessment_not_open")
	ErrWindowClosed     = errors.New("assessment_closed")
	ErrAttemptExpired   = errors.New("attempt_expired")
	ErrAttemptFinalised = errors.New("attempt_finalised")
	ErrVersionConflict  = errors.New("version_conflict")
	ErrAttemptNotFound  = errors.New("attempt_not_found")
	ErrForbidden        = errors.New("forbidden")
	// ErrAssessmentNotFound is the missing-assessment case of a Phase 2 read or
	// start: a client typo, not a server fault, so it must not surface as 500.
	ErrAssessmentNotFound = errors.New("assessment_not_found")
	// ErrInvalidAction is a bad admin attempt action (unknown verb, or a
	// destructive verb with no reason).
	ErrInvalidAction = errors.New("invalid_action")
)

// parseAttemptTime reuses parseContestTime so every layout the dashboard accepts
// (RFC3339 and the admin form's zone-less timestamps) is read the same way.
func parseAttemptTime(s string) (time.Time, bool) {
	if s == "" {
		return time.Time{}, false
	}
	t, ok := parseContestTime(s)
	if !ok {
		return time.Time{}, false
	}
	return t.UTC(), true
}

// CheckStartWindow applies the window table of plan §5.4.1.
func CheckStartWindow(c domain.Contest, now time.Time) error {
	start, hasStart := parseAttemptTime(c.StartTime)
	end, hasEnd := parseAttemptTime(c.EndTime)
	if hasStart && now.Before(start) {
		return ErrNotOpenYet
	}
	if c.EffectiveMode() == domain.ContestModeGlobal && hasEnd && now.After(end) {
		return ErrWindowClosed
	}
	return nil
}

// ComputeExpiresAt: global => EndTime (or start+duration when no EndTime);
// self_paced => started_at + duration (plan §5.4.2).
func ComputeExpiresAt(c domain.Contest, startedAt time.Time) time.Time {
	dur := time.Duration(c.DurationMinutes) * time.Minute
	if c.EffectiveMode() == domain.ContestModeSelfPaced {
		return startedAt.Add(dur)
	}
	if end, ok := parseAttemptTime(c.EndTime); ok {
		return end
	}
	if dur > 0 {
		return startedAt.Add(dur)
	}
	return startedAt.Add(24 * time.Hour)
}

// IsLateSubmission: late only in self_paced mode, when the effective submit
// time is after EndTime (decision 13: submitted after "until", even if started on time).
func IsLateSubmission(c domain.Contest, effectiveSubmit time.Time) bool {
	if c.EffectiveMode() != domain.ContestModeSelfPaced {
		return false
	}
	end, ok := parseAttemptTime(c.EndTime)
	return ok && effectiveSubmit.After(end)
}

// PenaltyFor returns the penalty percent applied (0 when on time or waived).
func PenaltyFor(c domain.Contest, late, waived bool) int {
	if !late || waived {
		return 0
	}
	p := c.LatePenaltyPercent
	if p < 0 {
		p = 0
	}
	if p > 100 {
		p = 100
	}
	return p
}

// ComputePoints = round(100 × correct ÷ total × (1 − penalty ÷ 100)) (plan §5.5).
func ComputePoints(correct, total, penaltyPercent int) int {
	if total <= 0 {
		return 0
	}
	return int(math.Round(100 * float64(correct) / float64(total) * (1 - float64(penaltyPercent)/100)))
}

// EffectiveSubmitTime: auto-submitted attempts count from expires_at, not from
// when the sweeper ran (plan §5.4.2).
func EffectiveSubmitTime(a domain.Attempt, now time.Time) time.Time {
	if a.Status == domain.AttemptAutoSubmitted {
		if t, ok := parseAttemptTime(a.ExpiresAt); ok {
			return t
		}
	}
	if t, ok := parseAttemptTime(a.SubmittedAt); ok {
		return t
	}
	return now
}

// AnswersVisible is the single answer-visibility rule replacing ContestHasEnded.
func AnswersVisible(c domain.Contest, a domain.Attempt, now time.Time) bool {
	if !a.Finalised() {
		return false
	}
	if c.EffectiveReveal() == domain.RevealOnSubmit {
		return true
	}
	end, ok := parseAttemptTime(c.EndTime)
	return !ok || !now.Before(end)
}

// GradeAnswers counts correct answers. Question.Answer is a 1-based index into
// MultipleChoice; a missing or -1 answer is skipped.
func GradeAnswers(questions []domain.Question, answers map[string]int) (correct, total int) {
	total = len(questions)
	for _, q := range questions {
		if sel, ok := answers[q.ID]; ok && sel > 0 && sel == q.Answer {
			correct++
		}
	}
	return
}

// ValidateContestPhase2 is the typed validation of plan §5.4.1.
func ValidateContestPhase2(c *domain.Contest) error {
	if c.Mode == "" {
		c.Mode = domain.ContestModeSelfPaced
	}
	if c.Mode != domain.ContestModeSelfPaced && c.Mode != domain.ContestModeGlobal {
		return errors.New("mode must be self_paced or global")
	}
	if c.Kind == "" {
		c.Kind = domain.ContestKindContest
	}
	if c.Mode == domain.ContestModeSelfPaced && c.DurationMinutes <= 0 {
		return errors.New("duration_minutes is required for self_paced assessments")
	}
	if c.LatePenaltyPercent < 0 || c.LatePenaltyPercent > 100 {
		return errors.New("late_penalty_percent must be between 0 and 100")
	}
	s, hs := parseAttemptTime(c.StartTime)
	e, he := parseAttemptTime(c.EndTime)
	if hs && he && !e.After(s) {
		return errors.New("end_time must be after start_time")
	}
	return nil
}

// EditorialVisible is the legacy-editorial form of AnswersVisible (plan §5.4.2).
// Legacy contests (empty mode) keep the old rule: answers unlock at EndTime.
// Phase 2 contests: a student who finished sees them per AnswersVisible. A
// student who never attempted gets the legacy page's rule back for window
// (global) contests — that paper can no longer be started, so publishing its
// answers leaks nothing. Self-paced contests keep accepting late attempts, so
// their answers stay private to the students who took them.
func EditorialVisible(c domain.Contest, participated bool, now time.Time) bool {
	if c.Mode == "" {
		return ContestHasEnded(c.EndTime)
	}
	if participated {
		return AnswersVisible(c, domain.Attempt{Status: domain.AttemptSubmitted}, now)
	}
	end, ok := parseAttemptTime(c.EndTime)
	return c.Mode == domain.ContestModeGlobal &&
		c.EffectiveReveal() != domain.RevealOnSubmit &&
		ok && !now.Before(end)
}
