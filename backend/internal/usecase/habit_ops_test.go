package usecase

import (
	"errors"
	"sort"
	"sync"
	"testing"
	"time"

	"victory-contest-go/internal/domain"
)

// Phase 6 behaviour tests: the access gate, Check toggling and streak math,
// milestone badges, the admin oversight filter, the streak-at-risk job and the
// concurrent-toggle guard. Everything runs against in-memory fakes and a fixed
// server clock (Addis 2026-11-03), so nothing depends on the wall clock.

const (
	habToday    = "2026-11-03"
	habStudent  = "s1"
	habProgram  = "training"
	habPlanFree = "plan-free"
)

// ---- fakes ----

type memHabRepo struct {
	plans map[string]domain.HabitPlan
	logs  map[string]domain.HabitLog
}

func newMemHabRepo() *memHabRepo {
	return &memHabRepo{plans: map[string]domain.HabitPlan{}, logs: map[string]domain.HabitLog{}}
}

func (r *memHabRepo) GetPlan(id string) (*domain.HabitPlan, error) {
	p, ok := r.plans[id]
	if !ok {
		return nil, nil
	}
	return &p, nil
}
func (r *memHabRepo) PutPlan(p domain.HabitPlan) error { r.plans[p.ID] = p; return nil }
func (r *memHabRepo) DeletePlan(id string) error       { delete(r.plans, id); return nil }
func (r *memHabRepo) ListAllPlans() ([]domain.HabitPlan, error) {
	out := []domain.HabitPlan{}
	for _, p := range r.plans {
		out = append(out, p)
	}
	return out, nil
}
func (r *memHabRepo) ListPlansByProgram(programID string) ([]domain.HabitPlan, error) {
	out := []domain.HabitPlan{}
	for _, p := range r.plans {
		if p.ProgramID == programID {
			out = append(out, p)
		}
	}
	return out, nil
}
func (r *memHabRepo) GetLog(id string) (*domain.HabitLog, error) {
	l, ok := r.logs[id]
	if !ok {
		return nil, nil
	}
	return &l, nil
}
func (r *memHabRepo) PutLog(l domain.HabitLog) error { r.logs[l.ID] = l; return nil }
func (r *memHabRepo) ListAllLogs() ([]domain.HabitLog, error) {
	out := []domain.HabitLog{}
	for _, l := range r.logs {
		out = append(out, l)
	}
	return out, nil
}
func (r *memHabRepo) ListLogsByStudent(studentID string) ([]domain.HabitLog, error) {
	out := []domain.HabitLog{}
	for _, l := range r.logs {
		if l.StudentID == studentID {
			out = append(out, l)
		}
	}
	return out, nil
}
func (r *memHabRepo) ListLogsByPlan(planID string) ([]domain.HabitLog, error) {
	out := []domain.HabitLog{}
	for _, l := range r.logs {
		if l.PlanID == planID {
			out = append(out, l)
		}
	}
	return out, nil
}

type stubHabStudents struct{ m map[string]*domain.Student }

func (s *stubHabStudents) GetStudentByID(id string) (*domain.Student, error) {
	return s.m[id], nil
}

type stubHabAccess struct{ acc StudentAccess }

func (s *stubHabAccess) AccessFor(string, bool) (StudentAccess, error) { return s.acc, nil }

type fakeHabAch struct {
	by     map[string]domain.Achievement
	addErr error
}

func newFakeHabAch() *fakeHabAch {
	return &fakeHabAch{by: map[string]domain.Achievement{}}
}
func (f *fakeHabAch) AddAchievement(a domain.Achievement) (string, error) {
	if f.addErr != nil {
		return "", f.addErr
	}
	f.by[a.ID] = a
	return a.ID, nil
}
func (f *fakeHabAch) UpdateAchievement(string, domain.Achievement) error { return nil }
func (f *fakeHabAch) DeleteAchievement(id string) error                  { delete(f.by, id); return nil }
func (f *fakeHabAch) GetAchievementByID(id string) (*domain.Achievement, error) {
	a, ok := f.by[id]
	if !ok {
		return nil, nil
	}
	return &a, nil
}
func (f *fakeHabAch) GetAllAchievements() ([]domain.Achievement, error) {
	out := []domain.Achievement{}
	for _, a := range f.by {
		out = append(out, a)
	}
	return out, nil
}
func (f *fakeHabAch) GetAchievementsByStudent(studentID string) ([]domain.Achievement, error) {
	out := []domain.Achievement{}
	for _, a := range f.by {
		if a.StudentID == studentID {
			out = append(out, a)
		}
	}
	return out, nil
}

type stubHabNotifier struct{ sent []domain.Notification }

func (s *stubHabNotifier) AddNotification(domain.Notification) (string, error)  { return "", nil }
func (s *stubHabNotifier) UpdateNotification(string, domain.Notification) error { return nil }
func (s *stubHabNotifier) DeleteNotification(string) error                      { return nil }
func (s *stubHabNotifier) MarkNotificationAsRead(string) error                  { return nil }
func (s *stubHabNotifier) GetNotificationByID(string) (*domain.Notification, error) {
	return nil, nil
}
func (s *stubHabNotifier) GetAllNotifications() ([]domain.Notification, error) { return nil, nil }
func (s *stubHabNotifier) GetNotificationsByRecipient(string) ([]domain.Notification, error) {
	return nil, nil
}
func (s *stubHabNotifier) GetNotificationsByRecipientAfterDate(string, time.Time) ([]domain.Notification, error) {
	return nil, nil
}
func (s *stubHabNotifier) GetNotificationsByRecipientAfterRegistration(string) ([]domain.Notification, error) {
	return nil, nil
}
func (s *stubHabNotifier) AnnounceContest(domain.Contest) error { return nil }
func (s *stubHabNotifier) SendNotification(title, message, kind, recipientID string) error {
	s.sent = append(s.sent, domain.Notification{Title: title, Message: message, Type: kind, RecipientID: recipientID})
	return nil
}

// ---- helpers ----

func habDay(n int, itemIDs ...string) domain.HabitDay {
	d := domain.HabitDay{Day: n, Title: "Day title"}
	for _, id := range itemIDs {
		d.Items = append(d.Items, domain.HabitItem{ID: id, Label: id})
	}
	return d
}

func habPlan(id, access string, days ...domain.HabitDay) domain.HabitPlan {
	return domain.HabitPlan{ID: id, ProgramID: habProgram, Title: "Track " + id, Access: access, IsActive: true, Days: days}
}

type habFixture struct {
	uc     *HabitUsecase
	repo   *memHabRepo
	studs  *stubHabStudents
	access *stubHabAccess
	ach    *fakeHabAch
	notif  *stubHabNotifier
	notes  *reminderNotes
}

func newHabUC() *habFixture {
	f := &habFixture{
		repo:   newMemHabRepo(),
		studs:  &stubHabStudents{m: map[string]*domain.Student{}},
		access: &stubHabAccess{},
		ach:    newFakeHabAch(),
		notif:  &stubHabNotifier{},
		notes:  &reminderNotes{seen: map[string]domain.Notification{}},
	}
	f.studs.m[habStudent] = &domain.Student{ID: habStudent, Name: "Alice", PrimaryProgramID: habProgram}
	programs := func() ([]domain.AcademyProgram, error) {
		return []domain.AcademyProgram{{ID: habProgram, Features: []string{domain.FeatureHabits}}}, nil
	}
	f.uc = NewHabitUsecase(f.repo, f.studs, f.access, programs, f.ach, f.notif).WithReminders(f.notes)
	f.uc.now = func() time.Time { return time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC) }
	return f
}

func habErrIs(t *testing.T, err, want error, ctx string) {
	t.Helper()
	if !errors.Is(err, want) {
		t.Fatalf("%s: got %v want %v", ctx, err, want)
	}
}

// ---- gate + access ----

func TestHabitGateAndCheckEndToEnd(t *testing.T) {
	f := newHabUC()
	f.repo.PutPlan(habPlan(habPlanFree, domain.HabitAccessFree, habDay(1, "d1a", "d1b")))

	// Reading today before starting is refused.
	if _, err := f.uc.Today(habStudent, habPlanFree); !errors.Is(err, ErrHabitNotStarted) {
		t.Fatalf("Today before Start = %v, want ErrHabitNotStarted", err)
	}

	v, err := f.uc.Start(habStudent, habPlanFree)
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if v.DayNumber != 1 || len(v.Items) != 2 || v.Items[0].Done || v.Items[1].Done {
		t.Fatalf("Start view wrong: day=%d items=%+v", v.DayNumber, v.Items)
	}

	// Toggle one item on.
	v, err = f.uc.Check(habStudent, habPlanFree, "d1a")
	if err != nil {
		t.Fatalf("Check on: %v", err)
	}
	if v.CurrentStreak != 1 || v.TotalDone != 1 || !v.Items[0].Done {
		t.Fatalf("after Check: streak=%d total=%d done=%v", v.CurrentStreak, v.TotalDone, v.Items[0].Done)
	}

	// Toggle it off again closes the day and the streak.
	v, err = f.uc.Check(habStudent, habPlanFree, "d1a")
	if err != nil {
		t.Fatalf("Check off: %v", err)
	}
	if v.CurrentStreak != 0 || v.TotalDone != 0 || v.Items[0].Done {
		t.Fatalf("after untoggle: streak=%d total=%d done=%v", v.CurrentStreak, v.TotalDone, v.Items[0].Done)
	}
}

func TestHabitPremiumGate(t *testing.T) {
	f := newHabUC()
	f.repo.PutPlan(habPlan("plan-prem", domain.HabitAccessPremium, habDay(1, "x")))

	// No entitlement -> locked premium.
	f.access.acc = StudentAccess{Entitlements: map[string]domain.Entitlement{}}
	if _, err := f.uc.Start(habStudent, "plan-prem"); err == nil {
		t.Fatal("expected locked error for premium plan without entitlement")
	} else {
		var le *LockedError
		if !errors.As(err, &le) {
			t.Fatalf("expected *LockedError, got %v", err)
		}
	}

	// Lifetime entitlement -> allowed.
	f.access.acc = StudentAccess{Entitlements: map[string]domain.Entitlement{
		habProgram: {ID: habStudent + "#" + habProgram, StudentID: habStudent, ProgramID: habProgram},
	}}
	if _, err := f.uc.Start(habStudent, "plan-prem"); err != nil {
		t.Fatalf("Start with entitlement: %v", err)
	}
}

func TestHabitUnknownItem(t *testing.T) {
	f := newHabUC()
	f.repo.PutPlan(habPlan(habPlanFree, domain.HabitAccessFree, habDay(1, "d1a")))
	if _, err := f.uc.Start(habStudent, habPlanFree); err != nil {
		t.Fatalf("Start: %v", err)
	}
	_, err := f.uc.Check(habStudent, habPlanFree, "ghost")
	habErrIs(t, err, ErrHabitItemUnknown, "Check unknown item")
}

func TestHabitNotEnrolled(t *testing.T) {
	f := newHabUC()
	f.repo.PutPlan(habPlan(habPlanFree, domain.HabitAccessFree, habDay(1, "d1a")))
	f.studs.m["outsider"] = &domain.Student{ID: "outsider", PrimaryProgramID: "other-program"}
	_, err := f.uc.Start("outsider", habPlanFree)
	habErrIs(t, err, ErrNotEnrolled, "Start unenrolled")
}

// ---- badges ----

func TestHabitBadgeAtMilestoneIsIdempotent(t *testing.T) {
	f := newHabUC()
	f.repo.PutPlan(habPlan(habPlanFree, domain.HabitAccessFree,
		habDay(7, "d7a", "d7b"),
	))
	// Seed 6 consecutive prior days so checking today lands a 7-day streak.
	id := domain.HabitLogID(habStudent, habPlanFree)
	f.repo.logs[id] = domain.HabitLog{
		ID: id, StudentID: habStudent, PlanID: habPlanFree, StartDate: "2026-10-28",
		Done: map[string][]string{
			"2026-10-28": {"z"}, "2026-10-29": {"z"}, "2026-10-30": {"z"},
			"2026-10-31": {"z"}, "2026-11-01": {"z"}, "2026-11-02": {"z"},
		},
	}

	v, err := f.uc.Check(habStudent, habPlanFree, "d7a")
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if v.CurrentStreak != 7 {
		t.Fatalf("streak = %d, want 7", v.CurrentStreak)
	}
	if len(v.BadgesEarned) != 1 || v.BadgesEarned[0].Rarity != "common" {
		t.Fatalf("badges earned = %+v", v.BadgesEarned)
	}
	badgeID := "habit#" + habStudent + "#" + habPlanFree + "#7"
	if _, ok := f.ach.by[badgeID]; !ok {
		t.Fatalf("badge %s not stored", badgeID)
	}

	// Reaching the milestone again (check a second item) must not duplicate it.
	v2, err := f.uc.Check(habStudent, habPlanFree, "d7b")
	if err != nil {
		t.Fatalf("Check 2: %v", err)
	}
	if len(v2.BadgesEarned) != 0 {
		t.Fatalf("duplicate badge earned: %+v", v2.BadgesEarned)
	}
	if len(f.ach.by) != 1 {
		t.Fatalf("achievement store has %d entries, want 1", len(f.ach.by))
	}
}

func TestHabitMeReturnsOnlyPrivateBadges(t *testing.T) {
	f := newHabUC()
	f.repo.PutPlan(habPlan(habPlanFree, domain.HabitAccessFree, habDay(1, "d1a")))
	if _, err := f.uc.Start(habStudent, habPlanFree); err != nil {
		t.Fatalf("Start: %v", err)
	}
	f.ach.by["b-habit"] = domain.Achievement{ID: "b-habit", StudentID: habStudent, Type: domain.HabitBadgeType, Name: "7-day streak"}
	f.ach.by["b-contest"] = domain.Achievement{ID: "b-contest", StudentID: habStudent, Type: "contest_winner", Name: "Winner"}

	me, err := f.uc.Me(habStudent)
	if err != nil {
		t.Fatalf("Me: %v", err)
	}
	if len(me.Tracks) != 1 || me.Tracks[0].PlanID != habPlanFree {
		t.Fatalf("tracks = %+v", me.Tracks)
	}
	if len(me.Badges) != 1 || me.Badges[0].ID != "b-habit" {
		t.Fatalf("badges leaked non-habit rows: %+v", me.Badges)
	}
}

// ---- admin oversight ----

func TestHabitOversightInactiveFilter(t *testing.T) {
	f := newHabUC()
	f.repo.PutPlan(habPlan("po", domain.HabitAccessFree, habDay(1, "d1a")))
	mk := func(sid, last string) {
		id := domain.HabitLogID(sid, "po")
		f.repo.logs[id] = domain.HabitLog{ID: id, StudentID: sid, PlanID: "po", StartDate: "2026-10-20", LastActiveAt: last}
	}
	f.studs.m["stu_inactive"] = &domain.Student{ID: "stu_inactive", Name: "Sleeping"}
	f.studs.m["stu_active"] = &domain.Student{ID: "stu_active", Name: "Busy"}
	mk("stu_inactive", "2026-10-26T09:00:00Z") // 8 days inactive
	mk("stu_active", "2026-11-02T09:00:00Z")   // 1 day inactive

	rows, err := f.uc.Oversight(HabitOversightFilter{InactiveDays: 7})
	if err != nil {
		t.Fatalf("Oversight: %v", err)
	}
	if len(rows) != 1 || rows[0].StudentID != "stu_inactive" {
		t.Fatalf("rows = %+v", rows)
	}
	if rows[0].DaysInactive != 8 {
		t.Fatalf("DaysInactive = %d, want 8", rows[0].DaysInactive)
	}

	// No filter returns both.
	all, err := f.uc.Oversight(HabitOversightFilter{})
	if err != nil {
		t.Fatalf("Oversight all: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("all rows = %d, want 2", len(all))
	}
}

// ---- nudge ----

func TestHabitNudgeRequiresStartedTrack(t *testing.T) {
	f := newHabUC()
	f.repo.PutPlan(habPlan(habPlanFree, domain.HabitAccessFree, habDay(1, "d1a")))

	if err := f.uc.Nudge(habStudent, habPlanFree, "come back"); !errors.Is(err, ErrHabitNotStarted) {
		t.Fatalf("Nudge before start = %v, want ErrHabitNotStarted", err)
	}

	if _, err := f.uc.Start(habStudent, habPlanFree); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := f.uc.Nudge(habStudent, habPlanFree, ""); err != nil {
		t.Fatalf("Nudge: %v", err)
	}
	if len(f.notif.sent) != 1 || f.notif.sent[0].Type != domain.NotificationTypeHabit {
		t.Fatalf("notifications sent = %+v", f.notif.sent)
	}
}

// ---- streak-at-risk job ----

func TestRunStreakRemindersIsIdempotent(t *testing.T) {
	f := newHabUC()
	f.repo.PutPlan(habPlan("pr", domain.HabitAccessFree, habDay(1, "d1a")))
	put := func(sid string, done map[string][]string) {
		id := domain.HabitLogID(sid, "pr")
		f.repo.logs[id] = domain.HabitLog{ID: id, StudentID: sid, PlanID: "pr", StartDate: "2026-11-02", Done: done}
	}
	put("r1", map[string][]string{"2026-11-02": {"z"}})                  // live streak, nothing today -> nudge
	put("r2", map[string][]string{"2026-11-02": {"z"}, habToday: {"z"}}) // already checked today -> skip
	f.repo.logs[domain.HabitLogID("r3", "pr")] = domain.HabitLog{
		ID: domain.HabitLogID("r3", "pr"), StudentID: "r3", PlanID: "pr", StartDate: "2026-10-01",
		Done: map[string][]string{"2026-10-01": {"z"}}, // broken streak -> skip
	}

	res, err := f.uc.RunStreakReminders()
	if err != nil {
		t.Fatalf("RunStreakReminders: %v", err)
	}
	if res.Scanned != 3 || res.Sent != 1 || res.Skipped != 0 || res.Errors != 0 {
		t.Fatalf("first run = %+v", res)
	}
	if len(f.notes.seen) != 1 {
		t.Fatalf("notes = %v, want exactly 1", keysOf(f.notes.seen))
	}

	res2, err := f.uc.RunStreakReminders()
	if err != nil {
		t.Fatalf("second run: %v", err)
	}
	if res2.Sent != 0 || res2.Skipped != 1 {
		t.Fatalf("second run = %+v, want Sent 0 Skipped 1", res2)
	}
}

// ---- concurrent toggle guard ----

func TestHabitConcurrentCheckNoLostUpdate(t *testing.T) {
	f := newHabUC()
	f.repo.PutPlan(habPlan(habPlanFree, domain.HabitAccessFree,
		habDay(1, "d1a", "d1b", "d1c", "d1d", "d1e", "d1f", "d1g", "d1h")))
	if _, err := f.uc.Start(habStudent, habPlanFree); err != nil {
		t.Fatalf("Start: %v", err)
	}
	items := []string{"d1a", "d1b", "d1c", "d1d", "d1e", "d1f", "d1g", "d1h"}

	var wg sync.WaitGroup
	errs := make([]error, len(items))
	for i, it := range items {
		wg.Add(1)
		go func(i int, it string) {
			defer wg.Done()
			_, errs[i] = f.uc.Check(habStudent, habPlanFree, it)
		}(i, it)
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("concurrent Check[%d]: %v", i, err)
		}
	}

	l, _ := f.repo.GetLog(domain.HabitLogID(habStudent, habPlanFree))
	got := append([]string(nil), l.Done[habToday]...)
	sort.Strings(got)
	if len(got) != len(items) {
		t.Fatalf("lost updates: %d items landed, want %d (%v)", len(got), len(items), got)
	}
	if l.TotalDone != len(items) {
		t.Fatalf("TotalDone = %d, want %d", l.TotalDone, len(items))
	}
}
