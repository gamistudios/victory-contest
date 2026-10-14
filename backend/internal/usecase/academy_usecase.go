package usecase

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"victory-contest-go/internal/domain"

	"github.com/google/uuid"
)

// AcademyError carries an HTTP status so the handler can map usecase failures
// without string matching.
type AcademyError struct {
	Status int
	Msg    string
}

func (e *AcademyError) Error() string { return e.Msg }

func acErr(status int, msg string) error { return &AcademyError{Status: status, Msg: msg} }

// AcademyContentDoc is one stored content document (see AcademyDynamoRepository).
type AcademyContentDoc struct {
	Kind string
	ID   string
	Data []byte
}

const (
	academyKindProgram = "program"
	academyKindStream  = "stream"
	academyKindSubject = "subject"
	academyKindChapter = "chapter"
	academyKindModule  = "module"
	academyKindDraft   = "draft"
	academyKindMeta    = "meta"

	academyCacheTTL       = 20 * time.Second
	academyProfileTTL     = 30 * time.Second
	academyMaxQuizHistory = 50
	academyMaxActiveDays  = 120
	academyStateRetries   = 5
)

// academyTZ is the calendar used for study streaks (Ethiopia, UTC+3).
var academyTZ = time.FixedZone("EAT", 3*3600)

type AcademyRepository interface {
	ListContent() ([]AcademyContentDoc, error)
	PutContent(kind, id string, data []byte) error
	PutContentIfAbsent(kind, id string, data []byte) (bool, error)
	DeleteContent(kind, id string) error
	GetStudentState(studentID string) (*domain.AcademyStudentState, error)
	PutStudentState(state *domain.AcademyStudentState, expectedVersion int64) error
	ListStudentStates() ([]domain.AcademyStudentState, error)
}

// AcademyTextGenerator is the slice of the AI usecase the Academy needs.
type AcademyTextGenerator interface {
	GenerateText(prompt string) (string, error)
}

type academyProfile struct {
	student *domain.Student
	premium bool
	at      time.Time
}

type AcademyUsecase struct {
	premiumResolver func(studentID string) bool // optional: entitlement-based premium (Phase 1)
	programResolver func(studentID string) map[string]bool // optional: entitled program ids (per-program locks)
	studentRepo     StudentRepository // optional: location rename propagation
	locStore        LocationStore                // optional: admin-managed locations
	repo     AcademyRepository
	students StudentUsecase
	ai       AcademyTextGenerator

	snapMu sync.Mutex
	snap   *academySnapshot

	profMu   sync.Mutex
	profiles map[string]academyProfile
}

func NewAcademyUsecase(repo AcademyRepository, students StudentUsecase, ai AcademyTextGenerator) *AcademyUsecase {
	return &AcademyUsecase{repo: repo, students: students, ai: ai, profiles: map[string]academyProfile{}}
}

/* ------------------------------ ids & helpers ------------------------------ */

func academyNewID(prefix string) string {
	return prefix + "-" + strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
}

func academyNow() string { return time.Now().UTC().Format(time.RFC3339) }

func academyClone[T any](v T) T {
	var out T
	b, err := json.Marshal(v)
	if err != nil {
		return v
	}
	if err := json.Unmarshal(b, &out); err != nil {
		return v
	}
	return out
}

func academyContains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

var (
	academyStreamOrder  = []string{"natural-science", "social-science", "common"}
	academyDifficulties = []string{"Beginner", "Intermediate", "Advanced", "Easy", "Medium", "Hard"}
)

// academyProgramRank orders programs by their data-driven SortOrder (plan §5.1);
// programs without one fall back to the legacy hardcoded order so existing
// databases keep their ordering until the v2 seed has run.
func academyProgramRank(p domain.AcademyProgram) int {
	if p.SortOrder > 0 {
		return p.SortOrder
	}
	return 1000 // unseeded programs sort after seeded ones (stable, by creation order)
}

func academyIndexOf(list []string, v string) int {
	for i, x := range list {
		if x == v {
			return i
		}
	}
	return len(list)
}

/* -------------------------------- snapshot -------------------------------- */

// academySnapshot is an immutable, indexed view of all content documents.
// Writers never mutate it: they persist and invalidate, readers rebuild.
type academySnapshot struct {
	programs []domain.AcademyProgram
	streams  []domain.AcademyStream
	subjects []*domain.AcademySubject
	chapters map[string]*domain.AcademyChapter
	modules  map[string]*domain.AcademyModule
	drafts   []*domain.AcademyAiDraft // newest first

	subjectByID       map[string]*domain.AcademySubject
	chaptersBySubject map[string][]*domain.AcademyChapter // ordered by order_number
	modulesByChapter  map[string][]*domain.AcademyModule  // ordered by order, all statuses
	loadedAt          time.Time
}

func (s *academySnapshot) programByID(id string) *domain.AcademyProgram {
	for i := range s.programs {
		if s.programs[i].ID == id {
			return &s.programs[i]
		}
	}
	return nil
}

func (s *academySnapshot) streamByID(id string) *domain.AcademyStream {
	for i := range s.streams {
		if s.streams[i].ID == id {
			return &s.streams[i]
		}
	}
	return nil
}

// sortedModules lists a chapter's modules in order; unpublished ones only when asked.
func (s *academySnapshot) sortedModules(chapterID string, includeUnpublished bool) []*domain.AcademyModule {
	var out []*domain.AcademyModule
	for _, m := range s.modulesByChapter[chapterID] {
		if includeUnpublished || m.PublishStatus == domain.AcademyStatusPublished {
			out = append(out, m)
		}
	}
	return out
}

// orderedSubjectModules is the flat reading order of a subject's published modules.
func (s *academySnapshot) orderedSubjectModules(subjectID string) []*domain.AcademyModule {
	var out []*domain.AcademyModule
	for _, c := range s.chaptersBySubject[subjectID] {
		out = append(out, s.sortedModules(c.ID, false)...)
	}
	return out
}

func normalizeAcademyModule(m *domain.AcademyModule) {
	if m.ResourceAccess == nil {
		m.ResourceAccess = map[string]string{}
	}
	if m.LearningObjectives == nil {
		m.LearningObjectives = []string{}
	}
	if m.DocumentAttachments == nil {
		m.DocumentAttachments = []domain.AcademyDocumentAttachment{}
	}
	for i := range m.DocumentAttachments {
		d := &m.DocumentAttachments[i]
		if d.Slides == nil {
			d.Slides = []domain.AcademyDocumentSlide{}
		}
		for j := range d.Slides {
			if d.Slides[j].KeyPoints == nil {
				d.Slides[j].KeyPoints = []string{}
			}
		}
	}
	if m.FlashcardDeck == nil {
		m.FlashcardDeck = []domain.AcademyFlashcard{}
	}
	for i := range m.FlashcardDeck {
		if m.FlashcardDeck[i].Tags == nil {
			m.FlashcardDeck[i].Tags = []string{}
		}
		if m.FlashcardDeck[i].ID == "" {
			m.FlashcardDeck[i].ID = academyNewID("fc")
		}
	}
	if m.Resources == nil {
		m.Resources = []domain.AcademyExternalResource{}
	}
	if m.VideoLesson != nil && m.VideoLesson.Transcript == nil {
		m.VideoLesson.Transcript = []domain.AcademyTranscriptItem{}
	}
	if m.Quiz != nil {
		if m.Quiz.Questions == nil {
			m.Quiz.Questions = []domain.AcademyQuizQuestion{}
		}
		for i := range m.Quiz.Questions {
			q := &m.Quiz.Questions[i]
			if q.CorrectAnswers == nil {
				q.CorrectAnswers = []int{}
			}
			if q.ID == "" {
				q.ID = academyNewID("q")
			}
		}
	}
}

func buildAcademySnapshot(docs []AcademyContentDoc) *academySnapshot {
	s := &academySnapshot{
		chapters:          map[string]*domain.AcademyChapter{},
		modules:           map[string]*domain.AcademyModule{},
		subjectByID:       map[string]*domain.AcademySubject{},
		chaptersBySubject: map[string][]*domain.AcademyChapter{},
		modulesByChapter:  map[string][]*domain.AcademyModule{},
		loadedAt:          time.Now(),
	}
	for _, d := range docs {
		var err error
		switch d.Kind {
		case academyKindProgram:
			var p domain.AcademyProgram
			if err = json.Unmarshal(d.Data, &p); err == nil {
				if p.AvailableStreams == nil {
					p.AvailableStreams = []string{}
				}
				s.programs = append(s.programs, p)
			}
		case academyKindStream:
			var st domain.AcademyStream
			if err = json.Unmarshal(d.Data, &st); err == nil {
				s.streams = append(s.streams, st)
			}
		case academyKindSubject:
			var sub domain.AcademySubject
			if err = json.Unmarshal(d.Data, &sub); err == nil {
				s.subjects = append(s.subjects, &sub)
			}
		case academyKindChapter:
			var c domain.AcademyChapter
			if err = json.Unmarshal(d.Data, &c); err == nil {
				s.chapters[c.ID] = &c
			}
		case academyKindModule:
			var m domain.AcademyModule
			if err = json.Unmarshal(d.Data, &m); err == nil {
				normalizeAcademyModule(&m)
				s.modules[m.ID] = &m
			}
		case academyKindDraft:
			var dr domain.AcademyAiDraft
			if err = json.Unmarshal(d.Data, &dr); err == nil {
				s.drafts = append(s.drafts, &dr)
			}
		}
		if err != nil {
			log.Printf("academy: skipping corrupt %s document %s: %v", d.Kind, d.ID, err)
		}
	}

	sort.SliceStable(s.programs, func(i, j int) bool {
		return academyProgramRank(s.programs[i]) < academyProgramRank(s.programs[j])
	})
	sort.SliceStable(s.streams, func(i, j int) bool {
		return academyIndexOf(academyStreamOrder, s.streams[i].ID) < academyIndexOf(academyStreamOrder, s.streams[j].ID)
	})
	programRank := make(map[string]int, len(s.programs))
	for i, p := range s.programs {
		programRank[p.ID] = i
	}
	sort.SliceStable(s.subjects, func(i, j int) bool {
		a, b := s.subjects[i], s.subjects[j]
		if x, y := programRank[a.LevelID], programRank[b.LevelID]; x != y {
			return x < y
		}
		if x, y := academyIndexOf(academyStreamOrder, a.StreamID), academyIndexOf(academyStreamOrder, b.StreamID); x != y {
			return x < y
		}
		return a.Name < b.Name
	})
	for _, sub := range s.subjects {
		s.subjectByID[sub.ID] = sub
	}
	for _, c := range s.chapters {
		s.chaptersBySubject[c.SubjectID] = append(s.chaptersBySubject[c.SubjectID], c)
	}
	for _, list := range s.chaptersBySubject {
		sort.SliceStable(list, func(i, j int) bool {
			if list[i].OrderNumber != list[j].OrderNumber {
				return list[i].OrderNumber < list[j].OrderNumber
			}
			return list[i].ID < list[j].ID
		})
	}
	for _, m := range s.modules {
		s.modulesByChapter[m.ChapterID] = append(s.modulesByChapter[m.ChapterID], m)
	}
	for _, list := range s.modulesByChapter {
		sort.SliceStable(list, func(i, j int) bool {
			if list[i].Order != list[j].Order {
				return list[i].Order < list[j].Order
			}
			return list[i].ID < list[j].ID
		})
	}
	for _, c := range s.chapters {
		ids := make([]string, 0, len(s.modulesByChapter[c.ID]))
		for _, m := range s.modulesByChapter[c.ID] {
			ids = append(ids, m.ID)
		}
		c.ModuleIDs = ids
	}
	sort.SliceStable(s.drafts, func(i, j int) bool { return s.drafts[i].CreatedAt > s.drafts[j].CreatedAt })
	return s
}

func (u *AcademyUsecase) snapshot() (*academySnapshot, error) {
	u.snapMu.Lock()
	defer u.snapMu.Unlock()
	if u.snap != nil && time.Since(u.snap.loadedAt) < academyCacheTTL {
		return u.snap, nil
	}
	docs, err := u.repo.ListContent()
	if err != nil {
		if u.snap != nil {
			log.Printf("academy: content reload failed, serving stale snapshot: %v", err)
			return u.snap, nil
		}
		return nil, err
	}
	u.snap = buildAcademySnapshot(docs)
	return u.snap, nil
}

func (u *AcademyUsecase) invalidate() {
	u.snapMu.Lock()
	u.snap = nil
	u.snapMu.Unlock()
}

/* ------------------------------ student identity ------------------------------ */

// academyInitialLevel picks the first Academy level for a student without a
// stored state: primary program, else first enrollment, else a valid grade.
func academyInitialLevel(st *domain.Student) (level, stream string) {
	if st == nil {
		return "", "common"
	}
	for _, e := range st.Enrollments {
		if e.ProgramID == st.PrimaryProgramID {
			return e.ProgramID, e.StreamID
		}
	}
	if len(st.Enrollments) > 0 {
		return st.Enrollments[0].ProgramID, st.Enrollments[0].StreamID
	}
	if st.PrimaryProgramID != "" {
		return st.PrimaryProgramID, "common"
	}
	if domain.IsValidGrade(st.Grade) {
		return "grade-" + st.Grade, "common"
	}
	return "", "common"
}

// profile resolves the contest-side student record (name, grade, premium).
// Students without a record still get a working Academy with free access.
func (u *AcademyUsecase) profile(tid string) (*domain.Student, bool, error) {
	u.profMu.Lock()
	if p, ok := u.profiles[tid]; ok && time.Since(p.at) < academyProfileTTL {
		u.profMu.Unlock()
		return p.student, p.premium, nil
	}
	u.profMu.Unlock()

	st, err := u.students.GetStudentByID(tid)
	if err == nil && st == nil {
		st, err = u.students.GetStudentByTelegramID(tid)
	}
	if err != nil {
		return nil, false, acErr(503, "could not load your profile, please retry")
	}
	premium := st != nil && st.IsPremium
	if u.premiumResolver != nil {
		premium = u.premiumResolver(tid)
	}
	u.profMu.Lock()
	u.profiles[tid] = academyProfile{student: st, premium: premium, at: time.Now()}
	u.profMu.Unlock()
	return st, premium, nil
}

func (u *AcademyUsecase) freshState(tid string, st *domain.Student) *domain.AcademyStudentState {
	level, stream := academyInitialLevel(st)
	if snap, err := u.snapshot(); err == nil {
		stream = academyStreamFromEnrollment(snap, stream)
	}
	return &domain.AcademyStudentState{
		StudentID:   tid,
		LevelID:     level,
		StreamID:    stream,
		TargetScore: 80,
		CreatedAt:   academyNow(),
	}
}

func normalizeAcademyState(s *domain.AcademyStudentState) {
	if s.ModuleProgress == nil {
		s.ModuleProgress = map[string]domain.AcademyModuleProgress{}
	}
	if s.FlashcardProgress == nil {
		s.FlashcardProgress = map[string]domain.AcademyFlashcardProgress{}
	}
	if s.QuizAttempts == nil {
		s.QuizAttempts = []domain.AcademyQuizAttempt{}
	}
	if s.ActiveDays == nil {
		s.ActiveDays = []string{}
	}
	if s.Referrals == nil {
		s.Referrals = map[string][]string{}
	}
}

func (u *AcademyUsecase) loadState(tid string, st *domain.Student) (*domain.AcademyStudentState, error) {
	state, err := u.repo.GetStudentState(tid)
	if err != nil {
		return nil, err
	}
	if state == nil {
		state = u.freshState(tid, st)
	}
	normalizeAcademyState(state)
	if u.programResolver != nil {
		state.AccessSet = true
		state.ProgramAccess = u.programResolver(tid)
	}
	return state, nil
}

// mutateState is the optimistic-locking read-modify-write for a student's state.
func (u *AcademyUsecase) mutateState(tid string, fn func(*domain.AcademyStudentState) error) (*domain.AcademyStudentState, error) {
	st, _, err := u.profile(tid)
	if err != nil {
		return nil, err
	}
	for attempt := 0; attempt < academyStateRetries; attempt++ {
		state, err := u.loadState(tid, st)
		if err != nil {
			return nil, err
		}
		if err := fn(state); err != nil {
			return nil, err
		}
		expected := state.Version
		state.Version = expected + 1
		state.UpdatedAt = academyNow()
		if err := u.repo.PutStudentState(state, expected); err != nil {
			if errors.Is(err, ErrConditionalCheckFailed) {
				continue
			}
			return nil, err
		}
		return state, nil
	}
	return nil, acErr(409, "your progress changed on another device, please retry")
}

func academyToday() string { return time.Now().In(academyTZ).Format("2006-01-02") }

func touchActiveDay(s *domain.AcademyStudentState) {
	today := academyToday()
	if n := len(s.ActiveDays); n > 0 && s.ActiveDays[n-1] == today {
		return
	}
	if academyContains(s.ActiveDays, today) {
		return
	}
	s.ActiveDays = append(s.ActiveDays, today)
	if len(s.ActiveDays) > academyMaxActiveDays {
		s.ActiveDays = s.ActiveDays[len(s.ActiveDays)-academyMaxActiveDays:]
	}
}

func academyStreak(days []string) int {
	set := make(map[string]bool, len(days))
	for _, d := range days {
		set[d] = true
	}
	d := time.Now().In(academyTZ)
	if !set[d.Format("2006-01-02")] {
		d = d.AddDate(0, 0, -1)
	}
	n := 0
	for set[d.Format("2006-01-02")] {
		n++
		d = d.AddDate(0, 0, -1)
	}
	return n
}

func (u *AcademyUsecase) studentView(tid string, st *domain.Student, premium bool, state *domain.AcademyStudentState) domain.AcademyStudent {
	view := domain.AcademyStudent{
		ID:          tid,
		FullName:    "Student",
		FirstName:   "Student",
		Grade:       "12",
		LevelID:     state.LevelID,
		StreamID:    state.StreamID,
		IsPremium:   premium,
		TargetScore: state.TargetScore,
	}
	if st != nil {
		if name := strings.TrimSpace(st.Name); name != "" {
			view.FullName = name
			view.FirstName = strings.Fields(name)[0]
		}
		if g := strings.TrimSpace(st.Grade); g != "" {
			view.Grade = g
		}
		view.AvatarURL = st.ImgURL
	}
	for _, friends := range state.Referrals {
		view.ReferralCount += len(friends)
	}
	return view
}

/* ---------------------------------- locks ---------------------------------- */

func academyResourceAccess(snap *academySnapshot, m *domain.AcademyModule, key string) string {
	if v := m.ResourceAccess[key]; v != "" {
		return v
	}
	if ch := snap.chapters[m.ChapterID]; ch != nil && ch.IsPremium {
		return domain.AcademyAccessPremium
	}
	return m.AccessStatus
}

func academyReferralUnlocked(m *domain.AcademyModule, state *domain.AcademyStudentState) bool {
	if !m.ReferralUnlock.Enabled {
		return false
	}
	return len(state.Referrals[m.ID]) >= m.ReferralUnlock.RequiredReferrals
}

func academyLocks(snap *academySnapshot, m *domain.AcademyModule, premium bool, state *domain.AcademyStudentState) map[string]bool {
	unlocked := academyReferralUnlocked(m, state)
	if state != nil && state.AccessSet {
		// Plan §5.3: entitlement must cover the module's own program.
		premium = state.ProgramAccess[m.LevelID]
	}
	locks := make(map[string]bool, len(domain.AcademyResourceKeys))
	for _, k := range domain.AcademyResourceKeys {
		locks[k] = !premium && !unlocked && academyResourceAccess(snap, m, k) == domain.AcademyAccessPremium
	}
	return locks
}

func academyAllLocked(locks map[string]bool) bool {
	for _, k := range domain.AcademyResourceKeys {
		if !locks[k] {
			return false
		}
	}
	return true
}

/* ------------------------------ response views ------------------------------ */

type AcademyModuleSummary struct {
	ID               string `json:"id"`
	ChapterID        string `json:"chapter_id"`
	Title            string `json:"title"`
	Order            int    `json:"order"`
	Difficulty       string `json:"difficulty"`
	EstimatedMinutes int    `json:"estimated_minutes"`
	AccessStatus     string `json:"access_status"`
	IsLocked         bool   `json:"is_locked"`
	HasVideo         bool   `json:"has_video"`
	HasDocuments     bool   `json:"has_documents"`
	HasFlashcards    bool   `json:"has_flashcards"`
	HasQuiz          bool   `json:"has_quiz"`
	PublishStatus    string `json:"publish_status"`
}

type AcademySubjectView struct {
	domain.AcademySubject
	CompletedModules   int `json:"completed_modules"`
	ProgressPercentage int `json:"progress_percentage"`
	LockedModules      int `json:"locked_modules"`
}

type AcademyChapterOutline struct {
	ID          string                 `json:"id"`
	SubjectID   string                 `json:"subject_id"`
	Title       string                 `json:"title"`
	OrderNumber int                    `json:"order_number"`
	Description string                 `json:"description"`
	IsPremium   bool                   `json:"is_premium"`
	IsLocked    bool                   `json:"is_locked"`
	Modules     []AcademyModuleSummary `json:"modules"`
}

type AcademyProgramView struct {
	domain.AcademyProgram
	SubjectsCount int `json:"subjects_count"`
}

type AcademySubjectOutline struct {
	Subject  AcademySubjectView      `json:"subject"`
	Chapters []AcademyChapterOutline `json:"chapters"`
	Progress struct {
		CompletedIDs []string `json:"completed_ids"`
		StartedIDs   []string `json:"started_ids"`
	} `json:"progress"`
}

type AcademyNeighbor struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	IsLocked bool   `json:"is_locked"`
}

type AcademyReferralState struct {
	Enabled  bool `json:"enabled"`
	Required int  `json:"required"`
	Current  int  `json:"current"`
	Unlocked bool `json:"unlocked"`
}

type AcademyModuleDetail struct {
	Module            domain.AcademyModule             `json:"module"`
	Locks             map[string]bool                  `json:"locks"`
	FullyLocked       bool                             `json:"fully_locked"`
	Progress          *domain.AcademyModuleProgress    `json:"progress"`
	FlashcardProgress *domain.AcademyFlashcardProgress `json:"flashcard_progress"`
	Subject           struct {
		ID         string `json:"id"`
		Name       string `json:"name"`
		ColorTheme string `json:"color_theme"`
		IconName   string `json:"icon_name"`
		LevelID    string `json:"level_id"`
		StreamID   string `json:"stream_id"`
	} `json:"subject"`
	Chapter struct {
		ID          string `json:"id"`
		Title       string `json:"title"`
		OrderNumber int    `json:"order_number"`
	} `json:"chapter"`
	Prev     *AcademyNeighbor     `json:"prev"`
	Next     *AcademyNeighbor     `json:"next"`
	Referral AcademyReferralState `json:"referral"`
	Counts   struct {
		Flashcards    int  `json:"flashcards"`
		QuizQuestions int  `json:"quiz_questions"`
		Documents     int  `json:"documents"`
		HasVideo      bool `json:"has_video"`
	} `json:"counts"`
}

type AcademyContinueModule struct {
	AcademyModuleSummary
	SubjectID    string `json:"subject_id"`
	SubjectName  string `json:"subject_name"`
	SubjectColor string `json:"subject_color"`
	Progress     int    `json:"progress"`
}

type AcademyRecommendedModule struct {
	AcademyModuleSummary
	SubjectID    string `json:"subject_id"`
	SubjectName  string `json:"subject_name"`
	SubjectColor string `json:"subject_color"`
	Reason       string `json:"reason"`
}

type AcademyWeakArea struct {
	Topic       string `json:"topic"`
	SubjectID   string `json:"subject_id"`
	SubjectName string `json:"subject_name"`
	ErrorRate   int    `json:"error_rate"`
	ModuleID    string `json:"module_id,omitempty"`
}

type AcademyDashboard struct {
	Student             domain.AcademyStudent       `json:"student"`
	StreakDays          int                         `json:"streak_days"`
	WeekActivity        []bool                      `json:"week_activity"`
	TotalMinutesStudied int                         `json:"total_minutes_studied"`
	OverallCompletion   int                         `json:"overall_completion"`
	CompletedModules    int                         `json:"completed_modules"`
	TotalModules        int                         `json:"total_modules"`
	ContinueModule      *AcademyContinueModule      `json:"continue_module"`
	RecommendedModule   *AcademyRecommendedModule   `json:"recommended_module"`
	Subjects            []AcademySubjectView        `json:"subjects"`
	FlashcardsDue       int                         `json:"flashcards_due"`
	WeakAreas           []AcademyWeakArea           `json:"weak_areas"`
	RecentQuizAttempts  []domain.AcademyQuizAttempt `json:"recent_quiz_attempts"`
	Target              struct {
		TargetScore    int `json:"target_score"`
		CurrentAverage int `json:"current_average"`
	} `json:"target"`
	Notice *struct {
		ID   string `json:"id"`
		Text string `json:"text"`
		Tone string `json:"tone"`
	} `json:"notice"`
}

func academySummarize(snap *academySnapshot, m *domain.AcademyModule, premium bool, state *domain.AcademyStudentState) AcademyModuleSummary {
	return AcademyModuleSummary{
		ID:               m.ID,
		ChapterID:        m.ChapterID,
		Title:            m.Title,
		Order:            m.Order,
		Difficulty:       m.Difficulty,
		EstimatedMinutes: m.EstimatedMinutes,
		AccessStatus:     m.AccessStatus,
		IsLocked:         academyLocks(snap, m, premium, state)[domain.AcademyResReading],
		HasVideo:         m.VideoLesson != nil,
		HasDocuments:     len(m.DocumentAttachments) > 0,
		HasFlashcards:    len(m.FlashcardDeck) > 0,
		HasQuiz:          m.Quiz != nil && len(m.Quiz.Questions) > 0,
		PublishStatus:    m.PublishStatus,
	}
}

func academySubjectView(snap *academySnapshot, s *domain.AcademySubject, premium bool, state *domain.AcademyStudentState) AcademySubjectView {
	mods := snap.orderedSubjectModules(s.ID)
	done, locked := 0, 0
	for _, m := range mods {
		if state.ModuleProgress[m.ID].Completed {
			done++
		}
		if academyLocks(snap, m, premium, state)[domain.AcademyResReading] {
			locked++
		}
	}
	sub := *s
	sub.ChaptersCount = len(snap.chaptersBySubject[s.ID])
	sub.TotalModulesCount = len(mods)
	pct := 0
	if len(mods) > 0 {
		pct = int(math.Round(float64(done) / float64(len(mods)) * 100))
	}
	return AcademySubjectView{AcademySubject: sub, CompletedModules: done, ProgressPercentage: pct, LockedModules: locked}
}

func academySubjectsFor(snap *academySnapshot, level, stream string, premium bool, state *domain.AcademyStudentState) []AcademySubjectView {
	out := []AcademySubjectView{}
	for _, s := range snap.subjects {
		if level != "" && s.LevelID != level {
			continue
		}
		if stream != "" && stream != "common" && s.StreamID != stream && s.StreamID != "common" {
			continue
		}
		out = append(out, academySubjectView(snap, s, premium, state))
	}
	return out
}

/* ------------------------------ student: profile ------------------------------ */

// context bundles everything a student request needs.
type academyCtx struct {
	snap    *academySnapshot
	student *domain.Student
	premium bool
	state   *domain.AcademyStudentState
}

func (u *AcademyUsecase) ctx(tid string) (*academyCtx, error) {
	snap, err := u.snapshot()
	if err != nil {
		return nil, err
	}
	st, premium, err := u.profile(tid)
	if err != nil {
		return nil, err
	}
	state, err := u.loadState(tid, st)
	if err != nil {
		return nil, err
	}
	return &academyCtx{snap: snap, student: st, premium: premium, state: state}, nil
}

func (u *AcademyUsecase) Me(tid string) (*domain.AcademyStudent, error) {
	c, err := u.ctx(tid)
	if err != nil {
		return nil, err
	}
	v := u.studentView(tid, c.student, c.premium, c.state)
	return &v, nil
}

func (u *AcademyUsecase) UpdateMe(tid, levelID, streamID string) (*domain.AcademyStudent, error) {
	snap, err := u.snapshot()
	if err != nil {
		return nil, err
	}
	if levelID != "" && snap.programByID(levelID) == nil {
		return nil, acErr(400, "level_id is invalid")
	}
	if streamID != "" && snap.streamByID(streamID) == nil {
		return nil, acErr(400, "stream_id is invalid")
	}
	// D8: students may only switch between programs they are enrolled in; the
	// stream always comes from the enrollment, never from the request.
	if levelID != "" {
		st, _, perr := u.profile(tid)
		if perr != nil {
			return nil, perr
		}
		if st != nil && len(st.Enrollments) > 0 {
			var found *domain.Enrollment
			for i := range st.Enrollments {
				if st.Enrollments[i].ProgramID == levelID {
					found = &st.Enrollments[i]
					break
				}
			}
			if found == nil {
				return nil, acErr(403, "you are not enrolled in this program")
			}
			if found.StreamID != "" {
				streamID = academyStreamFromEnrollment(snap, found.StreamID)
			}
		}
	}
	state, err := u.mutateState(tid, func(s *domain.AcademyStudentState) error {
		if levelID != "" {
			s.LevelID = levelID
		}
		if streamID != "" {
			s.StreamID = streamID
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	st, premium, err := u.profile(tid)
	if err != nil {
		return nil, err
	}
	v := u.studentView(tid, st, premium, state)
	return &v, nil
}

func (u *AcademyUsecase) SetTarget(tid string, target float64) (*domain.AcademyStudent, error) {
	if math.IsNaN(target) || target < 30 || target > 100 {
		return nil, acErr(400, "target_score must be between 30 and 100")
	}
	state, err := u.mutateState(tid, func(s *domain.AcademyStudentState) error {
		s.TargetScore = int(math.Round(target))
		return nil
	})
	if err != nil {
		return nil, err
	}
	st, premium, err := u.profile(tid)
	if err != nil {
		return nil, err
	}
	v := u.studentView(tid, st, premium, state)
	return &v, nil
}

func (u *AcademyUsecase) Programs() ([]AcademyProgramView, []domain.AcademyStream, error) {
	snap, err := u.snapshot()
	if err != nil {
		return nil, nil, err
	}
	out := make([]AcademyProgramView, 0, len(snap.programs))
	for _, p := range snap.programs {
		subjects, mods := 0, 0
		for _, s := range snap.subjects {
			if s.LevelID != p.ID {
				continue
			}
			subjects++
			mods += len(snap.orderedSubjectModules(s.ID))
		}
		p.TotalModulesCount = mods
		out = append(out, AcademyProgramView{AcademyProgram: p, SubjectsCount: subjects})
	}
	streams := snap.streams
	if streams == nil {
		streams = []domain.AcademyStream{}
	}
	return out, streams, nil
}

func (u *AcademyUsecase) Subjects(tid, level, stream string) ([]AcademySubjectView, error) {
	c, err := u.ctx(tid)
	if err != nil {
		return nil, err
	}
	return academySubjectsFor(c.snap, level, stream, c.premium, c.state), nil
}

func (u *AcademyUsecase) SubjectOutline(tid, id string) (*AcademySubjectOutline, error) {
	c, err := u.ctx(tid)
	if err != nil {
		return nil, err
	}
	s := c.snap.subjectByID[id]
	if s == nil {
		return nil, acErr(404, "subject not found")
	}
	out := &AcademySubjectOutline{Subject: academySubjectView(c.snap, s, c.premium, c.state)}
	out.Chapters = []AcademyChapterOutline{}
	for _, ch := range c.snap.chaptersBySubject[id] {
		mods := []AcademyModuleSummary{}
		allLocked := true
		for _, m := range c.snap.sortedModules(ch.ID, false) {
			sum := academySummarize(c.snap, m, c.premium, c.state)
			mods = append(mods, sum)
			if !sum.IsLocked {
				allLocked = false
			}
		}
		out.Chapters = append(out.Chapters, AcademyChapterOutline{
			ID: ch.ID, SubjectID: ch.SubjectID, Title: ch.Title, OrderNumber: ch.OrderNumber,
			Description: ch.Description, IsPremium: ch.IsPremium,
			IsLocked: len(mods) > 0 && allLocked, Modules: mods,
		})
	}
	out.Progress.CompletedIDs = []string{}
	out.Progress.StartedIDs = []string{}
	for mid, p := range c.state.ModuleProgress {
		if p.Completed {
			out.Progress.CompletedIDs = append(out.Progress.CompletedIDs, mid)
		} else {
			out.Progress.StartedIDs = append(out.Progress.StartedIDs, mid)
		}
	}
	sort.Strings(out.Progress.CompletedIDs)
	sort.Strings(out.Progress.StartedIDs)
	return out, nil
}

var (
	academyHeadingLine = regexp.MustCompile(`(?m)^#.*$`)
	academyFenceTag    = regexp.MustCompile(`:::[a-z-]*`)
)

func academyTeaser(md string) string {
	text := academyFenceTag.ReplaceAllString(academyHeadingLine.ReplaceAllString(md, ""), "")
	for _, line := range strings.Split(strings.TrimSpace(text), "\n") {
		if utf8.RuneCountInString(strings.TrimSpace(line)) > 40 {
			r := []rune(line)
			if len(r) > 220 {
				r = r[:220]
			}
			return string(r)
		}
	}
	return ""
}

// protectModule blanks every payload the student is locked out of
// (server-side premium content protection).
func academyProtectModule(m domain.AcademyModule, locks map[string]bool) domain.AcademyModule {
	if locks[domain.AcademyResReading] {
		m.ReadingMarkdown = academyTeaser(m.ReadingMarkdown)
	}
	if locks[domain.AcademyResVideo] && m.VideoLesson != nil {
		v := *m.VideoLesson
		v.URL, v.Transcript, v.Description = "", []domain.AcademyTranscriptItem{}, ""
		m.VideoLesson = &v
	}
	if locks[domain.AcademyResDocuments] {
		docs := make([]domain.AcademyDocumentAttachment, len(m.DocumentAttachments))
		for i, d := range m.DocumentAttachments {
			d.URL, d.Slides = "", []domain.AcademyDocumentSlide{}
			docs[i] = d
		}
		m.DocumentAttachments = docs
	}
	if locks[domain.AcademyResFlashcards] {
		m.FlashcardDeck = []domain.AcademyFlashcard{}
	}
	if locks[domain.AcademyResQuiz] && m.Quiz != nil {
		q := *m.Quiz
		q.Questions = []domain.AcademyQuizQuestion{}
		m.Quiz = &q
	}
	return m
}

func (u *AcademyUsecase) ModuleDetail(tid, id string) (*AcademyModuleDetail, error) {
	c, err := u.ctx(tid)
	if err != nil {
		return nil, err
	}
	m := c.snap.modules[id]
	if m == nil || m.PublishStatus != domain.AcademyStatusPublished {
		return nil, acErr(404, "module not found")
	}
	chapter := c.snap.chapters[m.ChapterID]
	subject := c.snap.subjectByID[m.SubjectID]
	if chapter == nil || subject == nil {
		return nil, acErr(404, "module not found")
	}
	locks := academyLocks(c.snap, m, c.premium, c.state)
	flat := c.snap.orderedSubjectModules(m.SubjectID)
	idx := -1
	for i, x := range flat {
		if x.ID == m.ID {
			idx = i
			break
		}
	}
	nb := func(i int) *AcademyNeighbor {
		if i < 0 || i >= len(flat) {
			return nil
		}
		return &AcademyNeighbor{ID: flat[i].ID, Title: flat[i].Title,
			IsLocked: academyLocks(c.snap, flat[i], c.premium, c.state)[domain.AcademyResReading]}
	}

	res := &AcademyModuleDetail{
		Module:      academyProtectModule(academyClone(*m), locks),
		Locks:       locks,
		FullyLocked: academyAllLocked(locks),
	}
	if p, ok := c.state.ModuleProgress[m.ID]; ok {
		pc := p
		res.Progress = &pc
	}
	if fp, ok := c.state.FlashcardProgress[m.ID]; ok {
		fc := fp
		res.FlashcardProgress = &fc
	}
	res.Subject.ID, res.Subject.Name, res.Subject.ColorTheme = subject.ID, subject.Name, subject.ColorTheme
	res.Subject.IconName, res.Subject.LevelID, res.Subject.StreamID = subject.IconName, subject.LevelID, subject.StreamID
	res.Chapter.ID, res.Chapter.Title, res.Chapter.OrderNumber = chapter.ID, chapter.Title, chapter.OrderNumber
	if idx >= 0 {
		res.Prev, res.Next = nb(idx-1), nb(idx+1)
	}
	res.Referral = academyReferralOf(m, c.state)
	res.Counts.Flashcards = len(m.FlashcardDeck)
	if m.Quiz != nil {
		res.Counts.QuizQuestions = len(m.Quiz.Questions)
	}
	res.Counts.Documents = len(m.DocumentAttachments)
	res.Counts.HasVideo = m.VideoLesson != nil
	return res, nil
}

func academyReferralOf(m *domain.AcademyModule, state *domain.AcademyStudentState) AcademyReferralState {
	req := m.ReferralUnlock.RequiredReferrals
	if req <= 0 {
		req = 2
	}
	return AcademyReferralState{
		Enabled:  m.ReferralUnlock.Enabled,
		Required: req,
		Current:  len(state.Referrals[m.ID]),
		Unlocked: academyReferralUnlocked(m, state),
	}
}

/* ------------------------------ student: progress ------------------------------ */

type AcademyProgressPatch struct {
	ReadPercentage      *float64 `json:"read_percentage"`
	VideoTimeSeconds    *int     `json:"video_time_seconds"`
	VideoCompleted      *bool    `json:"video_completed"`
	DocumentCurrentPage *int     `json:"document_current_page"`
	DocumentCompleted   *bool    `json:"document_completed"`
}

func academyEmptyProgress() domain.AcademyModuleProgress {
	return domain.AcademyModuleProgress{DocumentCurrentPage: 1, LastStudiedAt: academyNow()}
}

func academyClamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func (u *AcademyUsecase) publishedModule(id string) (*domain.AcademyModule, *academySnapshot, error) {
	snap, err := u.snapshot()
	if err != nil {
		return nil, nil, err
	}
	m := snap.modules[id]
	if m == nil || m.PublishStatus != domain.AcademyStatusPublished {
		return nil, nil, acErr(404, "module not found")
	}
	return m, snap, nil
}

func (u *AcademyUsecase) PostModuleProgress(tid, id string, patch AcademyProgressPatch) (*domain.AcademyModuleProgress, error) {
	if _, _, err := u.publishedModule(id); err != nil {
		return nil, err
	}
	var result domain.AcademyModuleProgress
	_, err := u.mutateState(tid, func(s *domain.AcademyStudentState) error {
		cur, ok := s.ModuleProgress[id]
		if !ok {
			cur = academyEmptyProgress()
		}
		if patch.ReadPercentage != nil {
			pct := academyClamp(int(math.Round(*patch.ReadPercentage)), 0, 100)
			if pct > cur.ReadPercentage {
				cur.ReadPercentage = pct
			}
		}
		if patch.VideoTimeSeconds != nil {
			cur.VideoTimeSeconds = academyClamp(*patch.VideoTimeSeconds, 0, 86400)
		}
		if patch.VideoCompleted != nil && *patch.VideoCompleted {
			cur.VideoCompleted = true
		}
		if patch.DocumentCurrentPage != nil {
			cur.DocumentCurrentPage = academyClamp(*patch.DocumentCurrentPage, 1, 10000)
		}
		if patch.DocumentCompleted != nil && *patch.DocumentCompleted {
			cur.DocumentCompleted = true
		}
		cur.LastStudiedAt = academyNow()
		s.ModuleProgress[id] = cur
		s.RecentModuleID = id
		touchActiveDay(s)
		result = cur
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}

type AcademyCompleteResult struct {
	Progress          domain.AcademyModuleProgress `json:"progress"`
	OverallCompletion int                          `json:"overall_completion"`
}

func academyLevelStreamModules(snap *academySnapshot, level, stream string) []*domain.AcademyModule {
	var out []*domain.AcademyModule
	for _, m := range snap.modules {
		if m.PublishStatus == domain.AcademyStatusPublished && m.LevelID == level && (m.StreamID == stream || m.StreamID == "common") {
			out = append(out, m)
		}
	}
	return out
}

func (u *AcademyUsecase) CompleteModule(tid, id string, completed bool) (*AcademyCompleteResult, error) {
	m, snap, err := u.publishedModule(id)
	if err != nil {
		return nil, err
	}
	_, premium, err := u.profile(tid)
	if err != nil {
		return nil, err
	}
	var res AcademyCompleteResult
	_, err = u.mutateState(tid, func(s *domain.AcademyStudentState) error {
		if academyLocks(snap, m, premium, s)[domain.AcademyResReading] {
			return acErr(403, "premium content")
		}
		cur, ok := s.ModuleProgress[id]
		if !ok {
			cur = academyEmptyProgress()
		}
		wasDone := cur.Completed
		cur.Completed = completed
		if completed {
			cur.ReadPercentage = 100
		}
		cur.LastStudiedAt = academyNow()
		s.ModuleProgress[id] = cur
		if completed && !wasDone {
			s.TotalMinutes += m.EstimatedMinutes
		}
		s.RecentModuleID = id
		touchActiveDay(s)

		mods := academyLevelStreamModules(snap, s.LevelID, s.StreamID)
		done := 0
		for _, x := range mods {
			if s.ModuleProgress[x.ID].Completed {
				done++
			}
		}
		res.Progress = cur
		if len(mods) > 0 {
			res.OverallCompletion = int(math.Round(float64(done) / float64(len(mods)) * 100))
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &res, nil
}

// ClaimReferral records that friendID joined through referrerID's link for a
// module. Every Telegram account can be counted for one referrer only, a
// student can never refer themselves, and each friend counts once per module.
func (u *AcademyUsecase) ClaimReferral(friendID, referrerID, moduleID string) (*AcademyReferralState, error) {
	friendID, referrerID = strings.TrimSpace(friendID), strings.TrimSpace(referrerID)
	if friendID == "" || referrerID == "" || moduleID == "" {
		return nil, acErr(400, "referrer_id and module_id are required")
	}
	if friendID == referrerID {
		return nil, acErr(400, "you cannot refer yourself")
	}
	m, _, err := u.publishedModule(moduleID)
	if err != nil {
		return nil, err
	}
	if !m.ReferralUnlock.Enabled {
		return nil, acErr(400, "referral unlock is not enabled for this content")
	}
	if ref, _, perr := u.profile(referrerID); perr != nil {
		return nil, perr
	} else if ref == nil {
		return nil, acErr(404, "referrer not found")
	}

	// 1) bind the friend to this referrer (only once, ever)
	conflict := false
	if _, err := u.mutateState(friendID, func(s *domain.AcademyStudentState) error {
		switch {
		case s.ReferredBy == "":
			s.ReferredBy = referrerID
		case s.ReferredBy != referrerID:
			conflict = true
		}
		return nil
	}); err != nil {
		return nil, err
	}
	if conflict {
		return nil, acErr(409, "this account was already counted for another referral")
	}

	// 2) count the friend for the referrer's module
	state, err := u.mutateState(referrerID, func(s *domain.AcademyStudentState) error {
		if academyContains(s.Referrals[moduleID], friendID) {
			return nil
		}
		if len(s.Referrals[moduleID]) >= m.ReferralUnlock.RequiredReferrals {
			return nil
		}
		s.Referrals[moduleID] = append(s.Referrals[moduleID], friendID)
		return nil
	})
	if err != nil {
		return nil, err
	}
	rs := academyReferralOf(m, state)
	return &rs, nil
}

func (u *AcademyUsecase) FlashcardReview(tid, moduleID string, mastered, struggling []string) (*domain.AcademyFlashcardProgress, error) {
	if moduleID == "" {
		return nil, acErr(400, "module_id is required")
	}
	if _, _, err := u.publishedModule(moduleID); err != nil {
		return nil, err
	}
	if len(mastered) > 500 || len(struggling) > 500 {
		return nil, acErr(400, "too many cards")
	}
	if mastered == nil {
		mastered = []string{}
	}
	if struggling == nil {
		struggling = []string{}
	}
	total := len(mastered) + len(struggling)
	fp := domain.AcademyFlashcardProgress{
		DeckModuleID:   moduleID,
		MasteredIDs:    mastered,
		StrugglingIDs:  struggling,
		LastReviewedAt: academyNow(),
	}
	if total > 0 {
		fp.RecallRate = int(math.Round(float64(len(mastered)) / float64(total) * 100))
	}
	if _, err := u.mutateState(tid, func(s *domain.AcademyStudentState) error {
		s.FlashcardProgress[moduleID] = fp
		touchActiveDay(s)
		return nil
	}); err != nil {
		return nil, err
	}
	return &fp, nil
}

type AcademyQuizAttemptInput struct {
	ModuleID       string   `json:"module_id"`
	QuizID         string   `json:"quiz_id"`
	Score          int      `json:"score"`
	TotalQuestions int      `json:"total_questions"`
	WeakTopics     []string `json:"weak_topics"`
	Source         string   `json:"source"`
	Passing        int      `json:"passing"`
}

func (u *AcademyUsecase) RecordQuizAttempt(tid string, in AcademyQuizAttemptInput) (*domain.AcademyQuizAttempt, error) {
	if in.ModuleID == "" || in.TotalQuestions <= 0 {
		return nil, acErr(400, "module_id and total_questions are required")
	}
	if in.TotalQuestions > 200 || in.Score < 0 || in.Score > in.TotalQuestions {
		return nil, acErr(400, "score must be between 0 and total_questions")
	}
	m, _, err := u.publishedModule(in.ModuleID)
	if err != nil {
		return nil, err
	}
	source := in.Source
	if source != "ai" {
		source = "module"
	}
	passing := 60
	if source == "module" && m.Quiz != nil && m.Quiz.PassingScorePercentage > 0 {
		passing = m.Quiz.PassingScorePercentage
	} else if in.Passing > 0 && in.Passing <= 100 {
		passing = in.Passing
	}
	weak := []string{}
	for _, t := range in.WeakTopics {
		t = strings.TrimSpace(t)
		if t == "" || len(weak) >= 10 {
			continue
		}
		if r := []rune(t); len(r) > 120 {
			t = string(r[:120])
		}
		weak = append(weak, t)
	}
	quizID := in.QuizID
	if quizID == "" {
		quizID = "ai"
	}
	pct := int(math.Round(float64(in.Score) / float64(in.TotalQuestions) * 100))
	attempt := domain.AcademyQuizAttempt{
		ID: academyNewID("qa"), ModuleID: in.ModuleID, QuizID: quizID, Score: in.Score,
		TotalQuestions: in.TotalQuestions, Percentage: pct, Passed: pct >= passing,
		CompletedAt: academyNow(), WeakTopics: weak, Source: source,
	}
	if _, err := u.mutateState(tid, func(s *domain.AcademyStudentState) error {
		s.QuizAttempts = append([]domain.AcademyQuizAttempt{attempt}, s.QuizAttempts...)
		if len(s.QuizAttempts) > academyMaxQuizHistory {
			s.QuizAttempts = s.QuizAttempts[:academyMaxQuizHistory]
		}
		s.RecentModuleID = in.ModuleID
		touchActiveDay(s)
		return nil
	}); err != nil {
		return nil, err
	}
	return &attempt, nil
}

func (u *AcademyUsecase) QuizAttempts(tid, moduleID string) ([]domain.AcademyQuizAttempt, error) {
	c, err := u.ctx(tid)
	if err != nil {
		return nil, err
	}
	out := []domain.AcademyQuizAttempt{}
	for _, a := range c.state.QuizAttempts {
		if moduleID == "" || a.ModuleID == moduleID {
			out = append(out, a)
		}
	}
	return out, nil
}

/* -------------------------------- dashboard -------------------------------- */

func academyModuleProgressPct(state *domain.AcademyStudentState, id string) int {
	p, ok := state.ModuleProgress[id]
	if !ok {
		return 0
	}
	if p.Completed {
		return 100
	}
	best := p.ReadPercentage
	if p.VideoCompleted {
		best = 100
	}
	return int(math.Round(float64(best) * 0.9))
}

func (u *AcademyUsecase) Dashboard(tid string) (*AcademyDashboard, error) {
	c, err := u.ctx(tid)
	if err != nil {
		return nil, err
	}
	snap, state := c.snap, c.state
	subjects := academySubjectsFor(snap, state.LevelID, state.StreamID, c.premium, state)
	var mods []*domain.AcademyModule
	for _, s := range subjects {
		mods = append(mods, snap.orderedSubjectModules(s.ID)...)
	}
	inPlan := make(map[string]*domain.AcademyModule, len(mods))
	done := 0
	for _, m := range mods {
		inPlan[m.ID] = m
		if state.ModuleProgress[m.ID].Completed {
			done++
		}
	}
	isLocked := func(m *domain.AcademyModule) bool {
		return academyLocks(snap, m, c.premium, state)[domain.AcademyResReading]
	}

	// continue: most recent unfinished, else first unfinished unlocked
	var cont *domain.AcademyModule
	bestAt := ""
	for id, p := range state.ModuleProgress {
		m := inPlan[id]
		if m == nil || p.Completed {
			continue
		}
		if p.LastStudiedAt > bestAt {
			bestAt, cont = p.LastStudiedAt, m
		}
	}
	if cont == nil {
		for _, m := range mods {
			if !state.ModuleProgress[m.ID].Completed && !isLocked(m) {
				cont = m
				break
			}
		}
	}

	// recommended: weakest topic's module, else next unstarted unlocked module
	var rec *domain.AcademyModule
	reason := "Next up in your plan"
	for _, a := range state.QuizAttempts {
		if len(a.WeakTopics) > 0 && inPlan[a.ModuleID] != nil {
			rec = inPlan[a.ModuleID]
			reason = "Strengthen “" + a.WeakTopics[0] + "”"
			break
		}
	}
	if rec == nil || (cont != nil && rec.ID == cont.ID) {
		rec = nil
		for _, m := range mods {
			_, started := state.ModuleProgress[m.ID]
			if !started && (cont == nil || m.ID != cont.ID) && !isLocked(m) {
				rec = m
				reason = "New topic you haven't started"
				break
			}
		}
	}

	weak := []AcademyWeakArea{}
	seen := map[string]bool{}
	for _, a := range state.QuizAttempts {
		m := snap.modules[a.ModuleID]
		if m == nil {
			continue
		}
		subj := snap.subjectByID[m.SubjectID]
		for _, t := range a.WeakTopics {
			if seen[t] {
				continue
			}
			seen[t] = true
			name := ""
			if subj != nil {
				name = subj.Name
			}
			weak = append(weak, AcademyWeakArea{Topic: t, SubjectID: m.SubjectID, SubjectName: name,
				ErrorRate: 100 - a.Percentage, ModuleID: m.ID})
		}
	}
	if len(weak) > 5 {
		weak = weak[:5]
	}

	struggling := 0
	for _, fp := range state.FlashcardProgress {
		struggling += len(fp.StrugglingIDs)
	}
	startedNoReview := 0
	for id := range state.ModuleProgress {
		if _, reviewed := state.FlashcardProgress[id]; reviewed {
			continue
		}
		if m := snap.modules[id]; m != nil && len(m.FlashcardDeck) > 0 {
			startedNoReview++
		}
	}

	// week activity Mon..Sun for the current week
	now := time.Now().In(academyTZ)
	offset := (int(now.Weekday()) + 6) % 7
	monday := now.AddDate(0, 0, -offset)
	active := map[string]bool{}
	for _, d := range state.ActiveDays {
		active[d] = true
	}
	week := make([]bool, 7)
	for i := 0; i < 7; i++ {
		week[i] = active[monday.AddDate(0, 0, i).Format("2006-01-02")]
	}

	recent := state.QuizAttempts
	if len(recent) > 5 {
		recent = recent[:5]
	}
	currentAvg := 0
	if len(recent) > 0 {
		sum := 0
		for _, a := range recent {
			sum += a.Percentage
		}
		currentAvg = int(math.Round(float64(sum) / float64(len(recent))))
	}

	d := &AcademyDashboard{
		Student:             u.studentView(tid, c.student, c.premium, state),
		StreakDays:          academyStreak(state.ActiveDays),
		WeekActivity:        week,
		TotalMinutesStudied: state.TotalMinutes,
		CompletedModules:    done,
		TotalModules:        len(mods),
		Subjects:            subjects,
		FlashcardsDue:       struggling + startedNoReview*3,
		WeakAreas:           weak,
		RecentQuizAttempts:  append([]domain.AcademyQuizAttempt{}, recent...),
	}
	if len(mods) > 0 {
		d.OverallCompletion = int(math.Round(float64(done) / float64(len(mods)) * 100))
	}
	d.Target.TargetScore, d.Target.CurrentAverage = state.TargetScore, currentAvg
	if cont != nil {
		s := snap.subjectByID[cont.SubjectID]
		d.ContinueModule = &AcademyContinueModule{
			AcademyModuleSummary: academySummarize(snap, cont, c.premium, state),
			SubjectID:            cont.SubjectID, SubjectName: s.Name, SubjectColor: s.ColorTheme,
			Progress: academyModuleProgressPct(state, cont.ID),
		}
	}
	if rec != nil {
		s := snap.subjectByID[rec.SubjectID]
		d.RecommendedModule = &AcademyRecommendedModule{
			AcademyModuleSummary: academySummarize(snap, rec, c.premium, state),
			SubjectID:            rec.SubjectID, SubjectName: s.Name, SubjectColor: s.ColorTheme, Reason: reason,
		}
	}
	return d, nil
}

func academyAtoi(s string, def int) int {
	if n, err := strconv.Atoi(strings.TrimSpace(s)); err == nil {
		return n
	}
	return def
}

var _ = fmt.Sprintf // keep fmt for error formatting helpers in sibling files

// academyStreamFromEnrollment maps an enrollment stream id (natural, social,
// common) to the academy stream id that exists in the snapshot.
func academyStreamFromEnrollment(snap *academySnapshot, id string) string {
	if snap.streamByID(id) != nil {
		return id
	}
	switch id {
	case "natural":
		return "natural-science"
	case "social":
		return "social-science"
	}
	return id
}
