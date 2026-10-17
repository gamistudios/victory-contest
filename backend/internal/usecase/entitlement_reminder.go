package usecase

import (
	"fmt"
	"log"
	"time"

	"victory-contest-go/internal/domain"
)

// Entitlement expiry reminders (plan §5.12, Phase 5 item 4).
//
// Two reminders per entitlement cycle, each sent at most once:
//   - "pre":   the first run that sees the entitlement within 7 days of its end
//   - "grace": the first run that sees it expired but still inside the grace window
//
// Double-notify guard: every reminder is written under a DETERMINISTIC
// notification id with a conditional put (attribute_not_exists), so a second
// run the same day - or another instance, or a restart - is a no-op. The id
// contains the expiry date, so a renewal (new expires_at) starts a fresh cycle.
// Because the guard is per cycle rather than per calendar day, a missed day
// (downtime) still gets its reminder on the next run instead of being skipped.

const (
	ReminderLeadDays       = 7
	NotificationTypeExpiry = "entitlement_expiry"
	reminderPhasePre       = "pre"
	reminderPhaseGrace     = "grace"
	reminderDailyHourUTC   = 6 // 09:00 Addis Ababa (UTC+3)
	reminderStartupDelay   = 45 * time.Second
	reminderMinSleep       = time.Minute
)

// EntitlementLister lists every entitlement row (admin/job use only).
type EntitlementLister interface {
	ListAll() ([]domain.Entitlement, error)
}

// NotificationPutIfAbsent stores a notification only when its id is new.
// created=false with a nil error means "already sent".
type NotificationPutIfAbsent interface {
	PutIfAbsent(n domain.Notification) (created bool, err error)
}

type EntitlementReminderUsecase struct {
	ents        EntitlementLister
	notes       NotificationPutIfAbsent
	programName func(programID string) string
	graceDays   int
	now         func() time.Time
}

func NewEntitlementReminderUsecase(ents EntitlementLister, notes NotificationPutIfAbsent, programName func(string) string) *EntitlementReminderUsecase {
	return &EntitlementReminderUsecase{
		ents: ents, notes: notes, programName: programName,
		graceDays: domain.DefaultGraceDays, now: time.Now,
	}
}

// ReminderResult is what one run did (logged; returned for tests/manual runs).
type ReminderResult struct {
	Scanned int `json:"scanned"`
	Pre     int `json:"pre_sent"`
	Grace   int `json:"grace_sent"`
	Skipped int `json:"already_sent"`
	Errors  int `json:"errors"`
}

// ReminderID is the deterministic notification id (exported for tests).
func ReminderID(entitlementID string, expiresAt time.Time, phase string) string {
	return fmt.Sprintf("entrem#%s#%s#%s", entitlementID, expiresAt.UTC().Format("20060102"), phase)
}

// RunOnce evaluates every entitlement against the current time.
func (u *EntitlementReminderUsecase) RunOnce() (ReminderResult, error) {
	var res ReminderResult
	all, err := u.ents.ListAll()
	if err != nil {
		return res, err
	}
	now := u.now()
	grace := time.Duration(u.graceDays) * 24 * time.Hour
	lead := ReminderLeadDays * 24 * time.Hour
	for _, e := range all {
		res.Scanned++
		if e.ExpiresAt == "" || e.StudentID == "" {
			continue // lifetime access never expires
		}
		exp, perr := time.Parse(time.RFC3339, e.ExpiresAt)
		if perr != nil {
			res.Errors++
			continue
		}
		var phase string
		switch {
		case now.Before(exp) && exp.Sub(now) <= lead:
			phase = reminderPhasePre
		case !now.Before(exp) && now.Before(exp.Add(grace)):
			phase = reminderPhaseGrace
		default:
			continue // not due yet, or the grace window is over
		}
		title, msg := u.compose(e, exp, now, phase, grace)
		created, perr := u.notes.PutIfAbsent(domain.Notification{
			ID:          ReminderID(e.ID, exp, phase),
			RecipientID: e.StudentID,
			Title:       title,
			Message:     msg,
			SentAt:      now.Format(time.RFC3339),
			Type:        NotificationTypeExpiry,
		})
		switch {
		case perr != nil:
			res.Errors++
			log.Printf("entitlement reminder %s: %v", e.ID, perr)
		case !created:
			res.Skipped++
		case phase == reminderPhasePre:
			res.Pre++
		default:
			res.Grace++
		}
	}
	return res, nil
}

func (u *EntitlementReminderUsecase) compose(e domain.Entitlement, exp, now time.Time, phase string, grace time.Duration) (string, string) {
	name := e.ProgramID
	if u.programName != nil {
		if n := u.programName(e.ProgramID); n != "" {
			name = n
		}
	}
	if phase == reminderPhasePre {
		days := int((exp.Sub(now) + 24*time.Hour - 1) / (24 * time.Hour)) // round up: 6.2 days -> 7
		if days < 1 {
			days = 1
		}
		unit := "days"
		if days == 1 {
			unit = "day"
		}
		return "Your access is ending soon ⏳",
			fmt.Sprintf("Your %s access ends in %d %s. Renew now to keep learning without a break.", name, days, unit)
	}
	left := int((exp.Add(grace).Sub(now) + 24*time.Hour - 1) / (24 * time.Hour))
	if left < 1 {
		left = 1
	}
	unit := "days"
	if left == 1 {
		unit = "day"
	}
	return "Your access has expired - grace period ⚠️",
		fmt.Sprintf("Your %s access has ended, but you can still use it for %d more %s. Renew now to avoid losing access.", name, left, unit)
}

// RunDaily runs once shortly after boot (catch-up) and then every day at
// 09:00 Addis time until stop closes. Idempotent by construction.
func (u *EntitlementReminderUsecase) RunDaily(stop <-chan struct{}) {
	wait := reminderStartupDelay
	for {
		select {
		case <-stop:
			return
		case <-time.After(wait):
		}
		if res, err := u.RunOnce(); err != nil {
			log.Printf("entitlement reminders failed: %v", err)
		} else {
			log.Printf("entitlement reminders: %+v", res)
		}
		wait = u.untilNextRun()
	}
}

func (u *EntitlementReminderUsecase) untilNextRun() time.Duration {
	now := u.now().UTC()
	next := time.Date(now.Year(), now.Month(), now.Day(), reminderDailyHourUTC, 0, 0, 0, time.UTC)
	if !next.After(now) {
		next = next.Add(24 * time.Hour)
	}
	if d := next.Sub(now); d > reminderMinSleep {
		return d
	}
	return reminderMinSleep
}
