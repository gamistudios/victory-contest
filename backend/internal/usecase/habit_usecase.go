package usecase

import (
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"

	"victory-contest-go/internal/domain"
)

var (
	ErrHabitPlanNotFound = errors.New("habit plan not found")
	ErrHabitNotStarted   = errors.New("habit track not started")
	ErrHabitInvalid      = errors.New("invalid habit plan")
	ErrHabitItemUnknown  = errors.New("item is not part of today's checklist")
	ErrHabitFinished     = errors.New("this 30-day track is finished")
	ErrHabitNoFeature    = errors.New("program does not offer habits")
)

// addisZone (shared with the revenue report) is Africa/Addis_Ababa: fixed
// UTC+3, no DST. Every habit date is derived from server time in this zone so a
// client can never back-fill.

const habitDateLayout = "2006-01-02"

// AddisDate formats t as the Addis calendar day (YYYY-MM-DD).
func AddisDate(t time.Time) string { return t.In(addisZone).Format(habitDateLayout) }

func parseHabitDate(s string) (time.Time, bool) {
	t, err := time.Parse(habitDateLayout, s)
	return t, err == nil
}

// HabitDayNumber is the 1-based day of a run started on start, as of today.
// Values outside 1..30 mean "not started yet" / "finished".
func HabitDayNumber(start, today string) int {
	s, ok1 := parseHabitDate(start)
	t, ok2 := parseHabitDate(today)
	if !ok1 || !ok2 {
		return 0
	}
	return int(t.Sub(s).Hours()/24) + 1
}

// ComputeHabitStreaks is the pure streak math. A day counts when it has at
// least one done item. current is the run ending today, or yesterday when
// today is still empty (the streak is alive until the day closes).
func ComputeHabitStreaks(done map[string][]string, today string) (current, best, total int) {
	var days []time.Time
	active := map[string]bool{}
	for d, ids := range done {
		if len(ids) == 0 {
			continue
		}
		t, ok := parseHabitDate(d)
		if !ok {
			continue
		}
		total += len(ids)
		days = append(days, t)
		active[d] = true
	}
	sort.Slice(days, func(i, j int) bool { return days[i].Before(days[j]) })
	run := 0
	for i, d := range days {
		if i > 0 && d.Sub(days[i-1]) == 24*time.Hour {
			run++
		} else {
			run = 1
		}
		if run > best {
			best = run
		}
	}
	t, ok := parseHabitDate(today)
	if !ok {
		return 0, best, total
	}
	cursor := t
	if !active[cursor.Format(habitDateLayout)] {
		cursor = cursor.AddDate(0, 0, -1)
	}
	for active[cursor.Format(habitDateLayout)] {
		current++
		cursor = cursor.AddDate(0, 0, -1)
	}
	return current, best, total
}

// HabitRepository is the storage the habit usecase needs.
type HabitRepository interface {
	GetPlan(id string) (*domain.HabitPlan, error)
	PutPlan(p domain.HabitPlan) error
	DeletePlan(id string) error
	ListAllPlans() ([]domain.HabitPlan, error)
	ListPlansByProgram(programID string) ([]domain.HabitPlan, error)
	GetLog(id string) (*domain.HabitLog, error)
	PutLog(l domain.HabitLog) error
	ListAllLogs() ([]domain.HabitLog, error)
	ListLogsByStudent(studentID string) ([]domain.HabitLog, error)
	ListLogsByPlan(planID string) ([]domain.HabitLog, error)
}

type HabitStudentSource interface {
	GetStudentByID(id string) (*domain.Student, error)
}

// HabitAccessSource is satisfied by *PricingUsecase.
type HabitAccessSource interface {
	AccessFor(studentID string, suspended bool) (StudentAccess, error)
}

type HabitUsecase struct {
	repo         HabitRepository
	students     HabitStudentSource
	access       HabitAccessSource
	programs     func() ([]domain.AcademyProgram, error)
	achievements AchievementUsecase
	notifier     NotificationUsecase
	notes        NotificationPutIfAbsent // deterministic-id reminders
	now          func() time.Time
	// checkMu serialises the habit-log read-modify-write (GetLog -> toggle ->
	// PutLog) so two devices tapping the same day cannot clobber each other.
	// Same pattern as the coupon redeem guard; habit volume makes a single lock
	// plenty, and the badge/notification stores are touched outside it.
	checkMu sync.Mutex
}

func NewHabitUsecase(repo HabitRepository, students HabitStudentSource, access HabitAccessSource,
	programs func() ([]domain.AcademyProgram, error), ach AchievementUsecase, notifier NotificationUsecase) *HabitUsecase {
	return &HabitUsecase{repo: repo, students: students, access: access, programs: programs,
		achievements: ach, notifier: notifier, now: time.Now}
}

// WithReminders enables the streak-at-risk job.
func (u *HabitUsecase) WithReminders(notes NotificationPutIfAbsent) *HabitUsecase {
	u.notes = notes
	return u
}

// ---- views ----

type HabitItemState struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Done  bool   `json:"done"`
}

type HabitCalendarDay struct {
	Day     int    `json:"day"`
	Date    string `json:"date"`
	Done    int    `json:"done"`
	Total   int    `json:"total"`
	State   string `json:"state"` // complete | partial | missed | upcoming
	IsToday bool   `json:"is_today"`
}

type HabitTodayView struct {
	PlanID        string               `json:"plan_id"`
	Title         string               `json:"title"`
	Date          string               `json:"date"`
	StartDate     string               `json:"start_date"`
	DayNumber     int                  `json:"day_number"`
	Finished      bool                 `json:"finished"`
	DayTitle      string               `json:"day_title"`
	Items         []HabitItemState     `json:"items"`
	CurrentStreak int                  `json:"current_streak"`
	BestStreak    int                  `json:"best_streak"`
	TotalDone     int                  `json:"total_done"`
	CompletionPct int                  `json:"completion_pct"`
	Calendar      []HabitCalendarDay   `json:"calendar"`
	BadgesEarned  []domain.Achievement `json:"badges_earned,omitempty"`
}

type HabitPlanView struct {
	ID            string    `json:"id"`
	ProgramID     string    `json:"program_id"`
	Title         string    `json:"title"`
	Access        string    `json:"access"`
	DaysCount     int       `json:"days_count"`
	Started       bool      `json:"started"`
	CurrentStreak int       `json:"current_streak"`
	Lock          *LockInfo `json:"lock,omitempty"`
}

type HabitTrackSummary struct {
	PlanID        string `json:"plan_id"`
	Title         string `json:"title"`
	ProgramID     string `json:"program_id"`
	StartDate     string `json:"start_date"`
	DayNumber     int    `json:"day_number"`
	Finished      bool   `json:"finished"`
	CurrentStreak int    `json:"current_streak"`
	BestStreak    int    `json:"best_streak"`
	TotalDone     int    `json:"total_done"`
	CompletionPct int    `json:"completion_pct"`
	LastActiveAt  string `json:"last_active_at"`
}

type HabitMeView struct {
	Tracks []HabitTrackSummary  `json:"tracks"`
	Badges []domain.Achievement `json:"badges"`
}

// ---- helpers ----

func habitDay(p *domain.HabitPlan, n int) *domain.HabitDay {
	for i := range p.Days {
		if p.Days[i].Day == n {
			return &p.Days[i]
		}
	}
	return nil
}

func habitPlanItemTotal(p *domain.HabitPlan) int {
	n := 0
	for _, d := range p.Days {
		n += len(d.Items)
	}
	return n
}

// habitValidDone counts done ids on date that belong to that date's checklist.
func habitValidDone(p *domain.HabitPlan, l *domain.HabitLog, date string) (done, total int) {
	d := habitDay(p, HabitDayNumber(l.StartDate, date))
	if d == nil {
		return 0, 0
	}
	in := map[string]bool{}
	for _, it := range d.Items {
		in[it.ID] = true
	}
	for _, id := range l.Done[date] {
		if in[id] {
			done++
		}
	}
	return done, len(d.Items)
}

func habitCompletionPct(p *domain.HabitPlan, l *domain.HabitLog) int {
	total := habitPlanItemTotal(p)
	if total == 0 {
		return 0
	}
	start, ok := parseHabitDate(l.StartDate)
	if !ok {
		return 0
	}
	done := 0
	for i := 0; i < domain.HabitTrackDays; i++ {
		d, _ := habitValidDone(p, l, start.AddDate(0, 0, i).Format(habitDateLayout))
		done += d
	}
	pct := done * 100 / total
	if pct > 100 {
		pct = 100
	}
	return pct
}

func (u *HabitUsecase) today() string { return AddisDate(u.now()) }

func (u *HabitUsecase) buildToday(p *domain.HabitPlan, l *domain.HabitLog) *HabitTodayView {
	today := u.today()
	n := HabitDayNumber(l.StartDate, today)
	v := &HabitTodayView{
		PlanID: p.ID, Title: p.Title, Date: today, StartDate: l.StartDate, DayNumber: n,
		Finished: n > domain.HabitTrackDays, Items: []HabitItemState{},
		CurrentStreak: l.CurrentStreak, BestStreak: l.BestStreak, TotalDone: l.TotalDone,
		CompletionPct: habitCompletionPct(p, l), Calendar: []HabitCalendarDay{},
	}
	// Stored streaks only move on a check; a missed day must still show as broken.
	cur, best, _ := ComputeHabitStreaks(l.Done, today)
	v.CurrentStreak = cur
	if best > v.BestStreak {
		v.BestStreak = best
	}
	if d := habitDay(p, n); d != nil && n >= 1 && n <= domain.HabitTrackDays {
		v.DayTitle = d.Title
		done := map[string]bool{}
		for _, id := range l.Done[today] {
			done[id] = true
		}
		for _, it := range d.Items {
			v.Items = append(v.Items, HabitItemState{ID: it.ID, Label: it.Label, Done: done[it.ID]})
		}
	}
	start, ok := parseHabitDate(l.StartDate)
	if ok {
		for i := 0; i < domain.HabitTrackDays; i++ {
			date := start.AddDate(0, 0, i).Format(habitDateLayout)
			done, total := habitValidDone(p, l, date)
			c := HabitCalendarDay{Day: i + 1, Date: date, Done: done, Total: total, IsToday: date == today}
			switch {
			case date > today:
				c.State = "upcoming"
			case total > 0 && done == total:
				c.State = "complete"
			case done > 0:
				c.State = "partial"
			case date == today:
				c.State = "upcoming" // still open
			default:
				c.State = "missed"
			}
			v.Calendar = append(v.Calendar, c)
		}
	}
	return v
}

func (u *HabitUsecase) student(id string) (*domain.Student, error) {
	s, err := u.students.GetStudentByID(id)
	if err != nil {
		return nil, err
	}
	if s == nil {
		return nil, ErrStudentNotFound
	}
	return s, nil
}

func habitEnrolled(s *domain.Student, programID string) bool {
	if s.PrimaryProgramID == programID {
		return true
	}
	for _, e := range s.Enrollments {
		if e.ProgramID == programID {
			return true
		}
	}
	return false
}

func (u *HabitUsecase) programHasHabits(programID string) bool {
	ps, err := u.programs()
	if err != nil {
		return false
	}
	for _, p := range ps {
		if p.ID == programID {
			return p.HasFeature(domain.FeatureHabits)
		}
	}
	return false
}

// gate resolves the plan and applies the single access function.
func (u *HabitUsecase) gate(s *domain.Student, planID string) (*domain.HabitPlan, error) {
	p, err := u.repo.GetPlan(planID)
	if err != nil {
		return nil, err
	}
	if p == nil || !p.IsActive {
		return nil, ErrHabitPlanNotFound
	}
	if !habitEnrolled(s, p.ProgramID) || !u.programHasHabits(p.ProgramID) {
		return nil, ErrNotEnrolled
	}
	d, err := u.decide(s, p)
	if err != nil {
		return nil, err
	}
	switch d {
	case Allowed:
		return p, nil
	case Suspended:
		return nil, ErrSuspendedStudent
	case NotPublished:
		return nil, ErrHabitPlanNotFound
	}
	return nil, &LockedError{Lock: LockFor(d, p.ProgramID)}
}

func (u *HabitUsecase) decide(s *domain.Student, p *domain.HabitPlan) (Decision, error) {
	acc, err := u.access.AccessFor(s.ID, s.IsSuspended)
	if err != nil {
		return Suspended, err
	}
	return Decide(acc, Resource{
		Scope:     domain.Scope{ProgramID: p.ProgramID, StreamID: domain.StreamCommon},
		Access:    p.Access,
		Published: p.IsActive,
	}, u.now(), domain.DefaultGraceDays), nil
}

// ---- student operations ----

// Start opens (or returns) the student's own run of the plan.
func (u *HabitUsecase) Start(studentID, planID string) (*HabitTodayView, error) {
	s, err := u.student(studentID)
	if err != nil {
		return nil, err
	}
	p, err := u.gate(s, planID)
	if err != nil {
		return nil, err
	}
	id := domain.HabitLogID(s.ID, p.ID)
	l, err := u.repo.GetLog(id)
	if err != nil {
		return nil, err
	}
	if l == nil {
		// A concurrent start from two devices writes the same empty log, so the
		// last write is harmless; only Check needs the lock (it mutates Done).
		l = &domain.HabitLog{ID: id, StudentID: s.ID, PlanID: p.ID, StartDate: u.today(), Done: map[string][]string{}}
		if err := u.repo.PutLog(*l); err != nil {
			return nil, err
		}
	}
	return u.buildToday(p, l), nil
}

func (u *HabitUsecase) Today(studentID, planID string) (*HabitTodayView, error) {
	s, err := u.student(studentID)
	if err != nil {
		return nil, err
	}
	p, err := u.gate(s, planID)
	if err != nil {
		return nil, err
	}
	l, err := u.repo.GetLog(domain.HabitLogID(s.ID, p.ID))
	if err != nil {
		return nil, err
	}
	if l == nil {
		return nil, ErrHabitNotStarted
	}
	return u.buildToday(p, l), nil
}

// Check toggles one item for the server-derived Addis date.
func (u *HabitUsecase) Check(studentID, planID, itemID string) (*HabitTodayView, error) {
	s, err := u.student(studentID)
	if err != nil {
		return nil, err
	}
	p, err := u.gate(s, planID)
	if err != nil {
		return nil, err
	}
	now := u.now()
	l, removed, err := u.toggleCheckItem(domain.HabitLogID(s.ID, p.ID), p, itemID, now)
	if err != nil {
		return nil, err
	}
	v := u.buildToday(p, l)
	if !removed {
		v.BadgesEarned = u.awardMilestones(s.ID, p, l.CurrentStreak, now)
	}
	return v, nil
}

// toggleCheckItem reads the student's log, toggles itemID for the server-derived
// Addis day, recomputes the streaks and writes it back. The whole read-modify-
// write runs under checkMu so a second tap on another device cannot clobber the
// first (the same last-write hazard the coupon redeem guard avoids). Badge and
// notification writes are idempotent and happen outside this lock.
func (u *HabitUsecase) toggleCheckItem(id string, p *domain.HabitPlan, itemID string, now time.Time) (*domain.HabitLog, bool, error) {
	u.checkMu.Lock()
	defer u.checkMu.Unlock()
	l, err := u.repo.GetLog(id)
	if err != nil {
		return nil, false, err
	}
	if l == nil {
		return nil, false, ErrHabitNotStarted
	}
	today := AddisDate(now)
	n := HabitDayNumber(l.StartDate, today)
	if n > domain.HabitTrackDays {
		return nil, false, ErrHabitFinished
	}
	d := habitDay(p, n)
	if d == nil {
		return nil, false, ErrHabitItemUnknown
	}
	known := false
	for _, it := range d.Items {
		if it.ID == itemID {
			known = true
		}
	}
	if !known {
		return nil, false, ErrHabitItemUnknown
	}
	if l.Done == nil {
		l.Done = map[string][]string{}
	}
	cur := l.Done[today]
	next := make([]string, 0, len(cur)+1)
	removed := false
	for _, x := range cur {
		if x == itemID {
			removed = true
			continue
		}
		next = append(next, x)
	}
	if removed {
		if len(next) == 0 {
			delete(l.Done, today)
		} else {
			l.Done[today] = next
		}
	} else {
		l.Done[today] = append(next, itemID)
		l.LastActiveAt = now.UTC().Format(time.RFC3339)
	}
	l.CurrentStreak, l.BestStreak, l.TotalDone = ComputeHabitStreaks(l.Done, today)
	if len(l.Done) == 0 {
		l.LastActiveAt = ""
	}
	if err := u.repo.PutLog(*l); err != nil {
		return nil, false, err
	}
	return l, removed, nil
}

// awardMilestones writes personal streak badges through the existing
// achievement mechanism under a deterministic id, so it is idempotent. Never
// points, never a board.
func (u *HabitUsecase) awardMilestones(studentID string, p *domain.HabitPlan, streak int, now time.Time) []domain.Achievement {
	var out []domain.Achievement
	if u.achievements == nil {
		return out
	}
	rarity := map[int]string{7: "common", 14: "rare", 30: "epic"}
	for _, m := range domain.HabitStreakMilestones {
		if streak < m {
			continue
		}
		id := fmt.Sprintf("habit#%s#%s#%d", studentID, p.ID, m)
		if ex, err := u.achievements.GetAchievementByID(id); err != nil || ex != nil {
			if err != nil {
				log.Printf("habit badge lookup %s: %v", id, err)
			}
			continue
		}
		a := domain.Achievement{
			ID: id, StudentID: studentID, Earned: "true", Type: domain.HabitBadgeType,
			Name:        fmt.Sprintf("%d-day streak", m),
			Description: fmt.Sprintf("%d days in a row on %s", m, p.Title),
			EarnedDate:  now.UTC().Format(time.RFC3339), Rarity: rarity[m], Progress: 100,
		}
		if _, err := u.achievements.AddAchievement(a); err != nil {
			log.Printf("habit badge %s: %v", id, err)
			continue
		}
		out = append(out, a)
	}
	return out
}

// Plans lists the visible tracks for the student's enrolled habit programs.
func (u *HabitUsecase) Plans(studentID string) ([]HabitPlanView, error) {
	s, err := u.student(studentID)
	if err != nil {
		return nil, err
	}
	logs, err := u.repo.ListLogsByStudent(s.ID)
	if err != nil {
		return nil, err
	}
	byPlan := map[string]domain.HabitLog{}
	for _, l := range logs {
		byPlan[l.PlanID] = l
	}
	progs := map[string]bool{}
	if s.PrimaryProgramID != "" {
		progs[s.PrimaryProgramID] = true
	}
	for _, e := range s.Enrollments {
		progs[e.ProgramID] = true
	}
	out := []HabitPlanView{}
	today := u.today()
	for pid := range progs {
		if !u.programHasHabits(pid) {
			continue
		}
		plans, err := u.repo.ListPlansByProgram(pid)
		if err != nil {
			return nil, err
		}
		for i := range plans {
			p := &plans[i]
			if !p.IsActive {
				continue
			}
			v := HabitPlanView{ID: p.ID, ProgramID: p.ProgramID, Title: p.Title, Access: p.Access, DaysCount: len(p.Days)}
			if l, ok := byPlan[p.ID]; ok {
				v.Started = true
				v.CurrentStreak, _, _ = ComputeHabitStreaks(l.Done, today)
			}
			if d, err := u.decide(s, p); err == nil {
				v.Lock = LockFor(d, p.ProgramID)
			} else {
				v.Lock = LockFor(LockedPremium, p.ProgramID) // fail closed
			}
			out = append(out, v)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Title < out[j].Title })
	return out, nil
}

// Me is the student's own progress and private streak badges.
func (u *HabitUsecase) Me(studentID string) (*HabitMeView, error) {
	logs, err := u.repo.ListLogsByStudent(studentID)
	if err != nil {
		return nil, err
	}
	v := &HabitMeView{Tracks: []HabitTrackSummary{}, Badges: []domain.Achievement{}}
	today := u.today()
	for i := range logs {
		l := &logs[i]
		p, err := u.repo.GetPlan(l.PlanID)
		if err != nil || p == nil {
			continue
		}
		v.Tracks = append(v.Tracks, u.summary(p, l, today))
	}
	sort.Slice(v.Tracks, func(i, j int) bool { return v.Tracks[i].StartDate > v.Tracks[j].StartDate })
	if u.achievements != nil {
		as, err := u.achievements.GetAchievementsByStudent(studentID)
		if err != nil {
			return nil, err
		}
		for _, a := range as {
			if a.Type == domain.HabitBadgeType {
				v.Badges = append(v.Badges, a)
			}
		}
	}
	return v, nil
}

func (u *HabitUsecase) summary(p *domain.HabitPlan, l *domain.HabitLog, today string) HabitTrackSummary {
	cur, best, total := ComputeHabitStreaks(l.Done, today)
	if l.BestStreak > best {
		best = l.BestStreak
	}
	n := HabitDayNumber(l.StartDate, today)
	return HabitTrackSummary{
		PlanID: p.ID, Title: p.Title, ProgramID: p.ProgramID, StartDate: l.StartDate, DayNumber: n,
		Finished: n > domain.HabitTrackDays, CurrentStreak: cur, BestStreak: best, TotalDone: total,
		CompletionPct: habitCompletionPct(p, l), LastActiveAt: l.LastActiveAt,
	}
}

// ---- admin: plans ----

// NormalizePlan validates and canonicalises an admin-authored plan. Item ids
// are minted for new items and preserved for existing ones, so logs survive edits.
func (u *HabitUsecase) NormalizePlan(p domain.HabitPlan) (domain.HabitPlan, error) {
	p.Title = strings.TrimSpace(p.Title)
	p.ProgramID = strings.TrimSpace(p.ProgramID)
	if p.Title == "" || len(p.Title) > 120 {
		return p, fmt.Errorf("%w: title is required (max 120 chars)", ErrHabitInvalid)
	}
	if p.Access == "" {
		p.Access = domain.HabitAccessFree
	}
	if p.Access != domain.HabitAccessFree && p.Access != domain.HabitAccessPremium {
		return p, fmt.Errorf("%w: access must be free or premium", ErrHabitInvalid)
	}
	if !u.programHasHabits(p.ProgramID) {
		return p, fmt.Errorf("%w: program must exist and have the habits feature", ErrHabitNoFeature)
	}
	if len(p.Days) == 0 || len(p.Days) > domain.HabitTrackDays {
		return p, fmt.Errorf("%w: a track has 1 to %d days", ErrHabitInvalid, domain.HabitTrackDays)
	}
	seenDay := map[int]bool{}
	seenItem := map[string]bool{}
	for i := range p.Days {
		d := &p.Days[i]
		if d.Day < 1 || d.Day > domain.HabitTrackDays || seenDay[d.Day] {
			return p, fmt.Errorf("%w: day numbers must be unique, 1..%d", ErrHabitInvalid, domain.HabitTrackDays)
		}
		seenDay[d.Day] = true
		d.Title = strings.TrimSpace(d.Title)
		if len(d.Items) > 20 {
			return p, fmt.Errorf("%w: day %d has more than 20 items", ErrHabitInvalid, d.Day)
		}
		items := make([]domain.HabitItem, 0, len(d.Items))
		for _, it := range d.Items {
			it.Label = strings.TrimSpace(it.Label)
			if it.Label == "" {
				continue
			}
			if len(it.Label) > 200 {
				return p, fmt.Errorf("%w: item label too long on day %d", ErrHabitInvalid, d.Day)
			}
			if it.ID == "" || seenItem[it.ID] {
				it.ID = GenerateUniqueId()
			}
			seenItem[it.ID] = true
			items = append(items, it)
		}
		d.Items = items
	}
	sort.Slice(p.Days, func(i, j int) bool { return p.Days[i].Day < p.Days[j].Day })
	return p, nil
}

// SavePlan creates (empty id) or replaces a plan. Authorisation is the handler's job.
func (u *HabitUsecase) SavePlan(p domain.HabitPlan) (*domain.HabitPlan, error) {
	p, err := u.NormalizePlan(p)
	if err != nil {
		return nil, err
	}
	if p.ID == "" {
		p.ID = GenerateUniqueId()
	}
	if err := u.repo.PutPlan(p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (u *HabitUsecase) GetPlan(id string) (*domain.HabitPlan, error) {
	p, err := u.repo.GetPlan(id)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, ErrHabitPlanNotFound
	}
	return p, nil
}

func (u *HabitUsecase) DeletePlan(id string) error { return u.repo.DeletePlan(id) }

// ListPlansAdmin lists plans for the given programs (nil = all).
func (u *HabitUsecase) ListPlansAdmin(programIDs []string) ([]domain.HabitPlan, error) {
	all, err := u.repo.ListAllPlans()
	if err != nil {
		return nil, err
	}
	out := []domain.HabitPlan{}
	for _, p := range all {
		if len(programIDs) > 0 && !containsString(programIDs, p.ProgramID) {
			continue
		}
		out = append(out, p)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Title < out[j].Title })
	return out, nil
}

// ---- admin: oversight ----

type HabitOversightFilter struct {
	ProgramIDs   []string // nil = all programs
	PlanID       string
	InactiveDays int  // >0: only students inactive for at least this many days
	Ascending    bool // sort by last_active_at oldest first
}

type HabitOversightRow struct {
	StudentID     string `json:"student_id"`
	StudentName   string `json:"student_name"`
	PlanID        string `json:"plan_id"`
	PlanTitle     string `json:"plan_title"`
	ProgramID     string `json:"program_id"`
	StartDate     string `json:"start_date"`
	DayNumber     int    `json:"day_number"`
	Finished      bool   `json:"finished"`
	CurrentStreak int    `json:"current_streak"`
	BestStreak    int    `json:"best_streak"`
	CompletionPct int    `json:"completion_pct"`
	LastActiveAt  string `json:"last_active_at"`
	DaysInactive  int    `json:"days_inactive"`
}

// Oversight is admin-only; nothing here is exposed to students.
func (u *HabitUsecase) Oversight(f HabitOversightFilter) ([]HabitOversightRow, error) {
	plans, err := u.ListPlansAdmin(f.ProgramIDs)
	if err != nil {
		return nil, err
	}
	today := u.today()
	names := map[string]string{}
	rows := []HabitOversightRow{}
	for i := range plans {
		p := &plans[i]
		if f.PlanID != "" && p.ID != f.PlanID {
			continue
		}
		logs, err := u.repo.ListLogsByPlan(p.ID)
		if err != nil {
			return nil, err
		}
		for j := range logs {
			l := &logs[j]
			sm := u.summary(p, l, today)
			inactive := habitDaysInactive(l, today)
			if f.InactiveDays > 0 && (sm.Finished || inactive < f.InactiveDays) {
				continue
			}
			name, ok := names[l.StudentID]
			if !ok {
				if st, err := u.students.GetStudentByID(l.StudentID); err == nil && st != nil {
					name = st.Name
				}
				names[l.StudentID] = name
			}
			rows = append(rows, HabitOversightRow{
				StudentID: l.StudentID, StudentName: name, PlanID: p.ID, PlanTitle: p.Title, ProgramID: p.ProgramID,
				StartDate: l.StartDate, DayNumber: sm.DayNumber, Finished: sm.Finished,
				CurrentStreak: sm.CurrentStreak, BestStreak: sm.BestStreak, CompletionPct: sm.CompletionPct,
				LastActiveAt: l.LastActiveAt, DaysInactive: inactive,
			})
		}
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if f.Ascending {
			return rows[i].LastActiveAt < rows[j].LastActiveAt
		}
		return rows[i].LastActiveAt > rows[j].LastActiveAt
	})
	return rows, nil
}

// habitDaysInactive counts Addis days since the last activity (or since the
// start when the student never checked anything).
func habitDaysInactive(l *domain.HabitLog, today string) int {
	from := l.StartDate
	if l.LastActiveAt != "" {
		if t, err := time.Parse(time.RFC3339, l.LastActiveAt); err == nil {
			from = AddisDate(t)
		}
	}
	a, ok1 := parseHabitDate(from)
	b, ok2 := parseHabitDate(today)
	if !ok1 || !ok2 || b.Before(a) {
		return 0
	}
	return int(b.Sub(a).Hours() / 24)
}

// Nudge sends an admin nudge through the existing notification path.
func (u *HabitUsecase) Nudge(studentID, planID, message string) error {
	l, err := u.repo.GetLog(domain.HabitLogID(studentID, planID))
	if err != nil {
		return err
	}
	if l == nil {
		return ErrHabitNotStarted
	}
	p, err := u.repo.GetPlan(planID)
	if err != nil {
		return err
	}
	if p == nil {
		return ErrHabitPlanNotFound
	}
	message = strings.TrimSpace(message)
	if message == "" {
		message = fmt.Sprintf("Your %s track is waiting for you. A small step today keeps your streak going.", p.Title)
	}
	if len(message) > 500 {
		message = message[:500]
	}
	return u.notifier.SendNotification("Keep going 💪", message, domain.NotificationTypeHabit, studentID)
}

// ---- streak-at-risk job ----

const habitReminderHourUTC = 15 // 18:00 Addis: evening, with time left to act

// HabitReminderID is the deterministic notification id: one per student, plan and Addis day.
func HabitReminderID(studentID, planID, date string) string {
	return fmt.Sprintf("habitrisk#%s#%s#%s", studentID, planID, strings.ReplaceAll(date, "-", ""))
}

type HabitReminderResult struct {
	Scanned int `json:"scanned"`
	Sent    int `json:"sent"`
	Skipped int `json:"already_sent"`
	Errors  int `json:"errors"`
}

// RunStreakReminders nudges students whose live streak has nothing checked
// today. Idempotent: a repeat run (or another instance) is a no-op.
func (u *HabitUsecase) RunStreakReminders() (HabitReminderResult, error) {
	var res HabitReminderResult
	if u.notes == nil {
		return res, errors.New("habit reminders not configured")
	}
	logs, err := u.repo.ListAllLogs()
	if err != nil {
		return res, err
	}
	plans := map[string]*domain.HabitPlan{}
	now := u.now()
	today := AddisDate(now)
	for i := range logs {
		l := &logs[i]
		res.Scanned++
		p, ok := plans[l.PlanID]
		if !ok {
			p, err = u.repo.GetPlan(l.PlanID)
			if err != nil {
				res.Errors++
				continue
			}
			plans[l.PlanID] = p
		}
		if p == nil || !p.IsActive || HabitDayNumber(l.StartDate, today) > domain.HabitTrackDays {
			continue
		}
		cur, _, _ := ComputeHabitStreaks(l.Done, today)
		if cur == 0 || len(l.Done[today]) > 0 {
			continue
		}
		created, perr := u.notes.PutIfAbsent(domain.Notification{
			ID:          HabitReminderID(l.StudentID, l.PlanID, today),
			RecipientID: l.StudentID,
			Title:       "Your streak is at risk 🔥",
			Message:     fmt.Sprintf("You're on a %d-day streak in %s. Check in today to keep it alive.", cur, p.Title),
			SentAt:      now.Format(time.RFC3339),
			Type:        domain.NotificationTypeHabit,
		})
		switch {
		case perr != nil:
			res.Errors++
			log.Printf("habit reminder %s: %v", l.ID, perr)
		case !created:
			res.Skipped++
		default:
			res.Sent++
		}
	}
	return res, nil
}

// RunDaily runs the reminder once a day at 18:00 Addis until stop closes.
func (u *HabitUsecase) RunDaily(stop <-chan struct{}) {
	for {
		now := u.now().UTC()
		next := time.Date(now.Year(), now.Month(), now.Day(), habitReminderHourUTC, 0, 0, 0, time.UTC)
		if !next.After(now) {
			next = next.Add(24 * time.Hour)
		}
		select {
		case <-stop:
			return
		case <-time.After(next.Sub(now)):
		}
		if res, err := u.RunStreakReminders(); err != nil {
			log.Printf("habit reminders failed: %v", err)
		} else {
			log.Printf("habit reminders: %+v", res)
		}
	}
}
