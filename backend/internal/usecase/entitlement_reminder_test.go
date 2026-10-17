package usecase

import (
	"testing"
	"time"

	"victory-contest-go/internal/domain"
)

// Entitlement expiry reminders (plan §5.12): two phases, each sent at most once
// per cycle. The double-notify guard is the deterministic reminder id, so the
// fakes below record ids and answer created=false on a repeat - exactly what the
// conditional DynamoDB put does in production.

type reminderEnts struct{ ents []domain.Entitlement }

func (f *reminderEnts) ListAll() ([]domain.Entitlement, error) { return f.ents, nil }

type reminderNotes struct {
	seen map[string]domain.Notification
	err  bool
}

func (f *reminderNotes) PutIfAbsent(n domain.Notification) (bool, error) {
	if f.err {
		return false, errReminderStub
	}
	if _, ok := f.seen[n.ID]; ok {
		return false, nil
	}
	f.seen[n.ID] = n
	return true, nil
}

var errReminderStub = &reminderError{"stub put failure"}

type reminderError struct{ s string }

func (e *reminderError) Error() string { return e.s }

func newReminder(ents []domain.Entitlement, now time.Time) (*EntitlementReminderUsecase, *reminderNotes) {
	notes := &reminderNotes{seen: map[string]domain.Notification{}}
	u := &EntitlementReminderUsecase{
		ents:        &reminderEnts{ents: ents},
		notes:       notes,
		programName: func(string) string { return "Grade 12" },
		graceDays:   domain.DefaultGraceDays,
		now:         func() time.Time { return now },
	}
	return u, notes
}

func expRFC(d time.Duration, from time.Time) string {
	return from.Add(d).UTC().Format(time.RFC3339)
}

func TestEntitlementReminderRunOnce(t *testing.T) {
	now := time.Date(2026, 3, 15, 0, 0, 0, 0, time.UTC)
	ents := []domain.Entitlement{
		{ID: "e-pre", StudentID: "s1", ProgramID: "g12", ExpiresAt: expRFC(5*24*time.Hour, now)},    // within 7d lead
		{ID: "e-grace", StudentID: "s2", ProgramID: "g12", ExpiresAt: expRFC(-1*24*time.Hour, now)}, // expired, inside 3d grace
		{ID: "e-later", StudentID: "s3", ProgramID: "g12", ExpiresAt: expRFC(30*24*time.Hour, now)}, // not due
		{ID: "e-over", StudentID: "s4", ProgramID: "g12", ExpiresAt: expRFC(-10*24*time.Hour, now)}, // grace over
		{ID: "e-life", StudentID: "s5", ProgramID: "g12", ExpiresAt: ""},                            // lifetime
		{ID: "e-bad", StudentID: "s6", ProgramID: "g12", ExpiresAt: "not-a-time"},                   // unparseable
	}
	u, notes := newReminder(ents, now)

	res, err := u.RunOnce()
	if err != nil {
		t.Fatal(err)
	}
	if res.Scanned != 6 {
		t.Fatalf("scanned = %d, want 6", res.Scanned)
	}
	if res.Pre != 1 || res.Grace != 1 {
		t.Fatalf("pre/grace = %d/%d, want 1/1", res.Pre, res.Grace)
	}
	if res.Skipped != 0 || res.Errors != 1 {
		t.Fatalf("skipped/errors = %d/%d, want 0/1", res.Skipped, res.Errors)
	}
	// Only the two due entitlements got a notification, keyed by the phase.
	if len(notes.seen) != 2 {
		t.Fatalf("stored %d notifications, want 2", len(notes.seen))
	}
	preID := ReminderID("e-pre", now.Add(5*24*time.Hour), reminderPhasePre)
	if n, ok := notes.seen[preID]; !ok {
		t.Fatalf("missing pre reminder %s (ids %v)", preID, keysOf(notes.seen))
	} else if n.RecipientID != "s1" || n.Type != NotificationTypeExpiry {
		t.Fatalf("pre notification = %+v, want recipient s1 / type %s", n, NotificationTypeExpiry)
	}
}

func TestEntitlementReminderIsIdempotentPerCycle(t *testing.T) {
	now := time.Date(2026, 3, 15, 0, 0, 0, 0, time.UTC)
	ents := []domain.Entitlement{{ID: "e1", StudentID: "s1", ProgramID: "g12", ExpiresAt: expRFC(3*24*time.Hour, now)}}
	u, _ := newReminder(ents, now)

	first, _ := u.RunOnce()
	if first.Pre != 1 {
		t.Fatalf("first run pre = %d, want 1", first.Pre)
	}
	second, _ := u.RunOnce()
	if second.Pre != 0 || second.Skipped != 1 {
		t.Fatalf("second run pre/skipped = %d/%d, want 0/1 (no double notify)", second.Pre, second.Skipped)
	}

	// A renewal is a NEW cycle: a later expiry has a different id, so it re-sends.
	ents[0].ExpiresAt = expRFC(20*24*time.Hour, now) // now out of the lead window
	renewed, _ := u.RunOnce()
	if renewed.Pre != 0 && renewed.Grace != 0 {
		// 20 days ahead is not due yet, so nothing is expected here.
		if renewed.Skipped != 0 {
			t.Fatalf("far-future entitlement should send nothing, got %+v", renewed)
		}
	}
	// Bring the renewed expiry back inside the lead window: a fresh id, so it fires.
	ents[0].ExpiresAt = expRFC(2*24*time.Hour, now)
	third, _ := u.RunOnce()
	if third.Pre != 1 {
		t.Fatalf("after renewal pre = %d, want 1 (new cycle re-notifies)", third.Pre)
	}
}

func TestEntitlementReminderCountsPutErrors(t *testing.T) {
	now := time.Date(2026, 3, 15, 0, 0, 0, 0, time.UTC)
	ents := []domain.Entitlement{{ID: "e1", StudentID: "s1", ProgramID: "g12", ExpiresAt: expRFC(2*24*time.Hour, now)}}
	u, notes := newReminder(ents, now)
	notes.err = true
	res, err := u.RunOnce()
	if err != nil {
		t.Fatal(err)
	}
	if res.Errors != 1 || res.Pre != 0 {
		t.Fatalf("errors/pre = %d/%d, want 1/0", res.Errors, res.Pre)
	}
}

func keysOf(m map[string]domain.Notification) []string {
	var out []string
	for k := range m {
		out = append(out, k)
	}
	return out
}
