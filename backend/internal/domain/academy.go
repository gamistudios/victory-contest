package domain

// Victory Academy (Learn) domain. The JSON tags are the API contract shared
// with the three frontends (frontend/src/types/academy.ts) - do not rename.
//
// Content entities (programs, streams, subjects, chapters, modules, AI drafts)
// are persisted as JSON documents in the `academy_content` table; per-student
// learning state is one JSON document per student in `academy_students`.

// Resource keys: every learning resource of a module can be locked on its own.
const (
	AcademyResReading    = "reading"
	AcademyResVideo      = "video"
	AcademyResDocuments  = "documents"
	AcademyResFlashcards = "flashcards"
	AcademyResQuiz       = "quiz"
	AcademyResAiTutor    = "ai_tutor"
)

// AcademyResourceKeys is the canonical, ordered list of lockable resources.
var AcademyResourceKeys = []string{
	AcademyResReading, AcademyResVideo, AcademyResDocuments,
	AcademyResFlashcards, AcademyResQuiz, AcademyResAiTutor,
}

const (
	AcademyAccessFree    = "free"
	AcademyAccessPremium = "premium"

	AcademyStatusPublished = "published"
	AcademyStatusDraft     = "draft"
	AcademyStatusScheduled = "scheduled"
	AcademyStatusArchived  = "archived"
)

type AcademyProgram struct {
	ID                string   `json:"id"`
	Name              string   `json:"name"`
	ShortCode         string   `json:"short_code"`
	Description       string   `json:"description"`
	IconName          string   `json:"icon_name"`
	AvailableStreams  []string `json:"available_streams"`
	TargetExamYear    string   `json:"target_exam_year,omitempty"`
	TotalModulesCount int      `json:"total_modules_count"`
	IsActive          bool     `json:"is_active"`
	// Phase 1 - programs are data (plan §5.1). All optional. Behaviour is
	// decided by Features / AvailableStreams, NEVER by Kind or ID.
	Kind                string   `json:"kind,omitempty"`  // label/preset: school_grade|entrance_exam|remedial|freshman|exit_exam|training|custom
	Group               string   `json:"group,omitempty"` // UI grouping
	Features            []string `json:"features,omitempty"`
	Grade               string   `json:"grade,omitempty"` // "9".."12"; derives Student.Grade
	SortOrder           int      `json:"sort_order"`
	OpenForRegistration bool     `json:"open_for_registration"`
}

// Program feature flags.
const (
	FeatureLectures    = "lectures"
	FeatureAssessments = "assessments"
	FeatureLeaderboard = "leaderboard"
	FeatureAITutor     = "ai_tutor"
	FeatureHabits      = "habits"
)

// ValidProgramFeatures is the closed set accepted by the admin API.
var ValidProgramFeatures = []string{FeatureLectures, FeatureAssessments, FeatureLeaderboard, FeatureAITutor, FeatureHabits}

// ValidProgramKinds is the closed set of preset labels.
var ValidProgramKinds = []string{"school_grade", "entrance_exam", "remedial", "freshman", "exit_exam", "training", "custom"}

// HasFeature reports whether the program enables the feature.
func (p AcademyProgram) HasFeature(f string) bool {
	for _, x := range p.Features {
		if x == f {
			return true
		}
	}
	return false
}

// NeedsStreamChoice is true when a student must pick natural/social: the
// program offers at least one stream other than "common".
func (p AcademyProgram) NeedsStreamChoice() bool {
	for _, s := range p.AvailableStreams {
		if s != StreamCommon {
			return true
		}
	}
	return false
}

// AllowsStream reports whether streamID can be enrolled in (common is always
// allowed as the shared stream).
func (p AcademyProgram) AllowsStream(streamID string) bool {
	if streamID == StreamCommon && !p.NeedsStreamChoice() {
		return true
	}
	for _, s := range p.AvailableStreams {
		if s == streamID {
			return true
		}
	}
	return false
}

type AcademyStream struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	IconName    string `json:"icon_name"`
}

type AcademySubject struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	Code              string `json:"code"`
	LevelID           string `json:"level_id"`
	StreamID          string `json:"stream_id"`
	Description       string `json:"description"`
	IconName          string `json:"icon_name"`
	ColorTheme        string `json:"color_theme"`
	ChaptersCount     int    `json:"chapters_count"`
	TotalModulesCount int    `json:"total_modules_count"`
}

type AcademyChapter struct {
	ID          string   `json:"id"`
	SubjectID   string   `json:"subject_id"`
	Title       string   `json:"title"`
	OrderNumber int      `json:"order_number"`
	Description string   `json:"description"`
	IsPremium   bool     `json:"is_premium"`
	ModuleIDs   []string `json:"module_ids"` // derived on read, never trusted from storage
}

type AcademyTranscriptItem struct {
	ID               string `json:"id"`
	TimestampSeconds int    `json:"timestamp_seconds"`
	TimeStr          string `json:"time_str"`
	Text             string `json:"text"`
}

type AcademyVideoLesson struct {
	ID               string                  `json:"id"`
	Title            string                  `json:"title"`
	Type             string                  `json:"type"` // direct | youtube
	URL              string                  `json:"url"`
	DurationSeconds  int                     `json:"duration_seconds"`
	InstructorName   string                  `json:"instructor_name"`
	InstructorRole   string                  `json:"instructor_role"`
	InstructorAvatar string                  `json:"instructor_avatar,omitempty"`
	Description      string                  `json:"description"`
	Transcript       []AcademyTranscriptItem `json:"transcript"`
}

type AcademyDocumentSlide struct {
	SlideNumber    int      `json:"slide_number"`
	Title          string   `json:"title"`
	KeyPoints      []string `json:"key_points"`
	Notes          string   `json:"notes,omitempty"`
	DiagramTitle   string   `json:"diagram_title,omitempty"`
	DiagramSvgType string   `json:"diagram_svg_type,omitempty"`
}

type AcademyDocumentAttachment struct {
	ID               string                 `json:"id"`
	Title            string                 `json:"title"`
	Type             string                 `json:"type"` // pdf | pptx
	URL              string                 `json:"url"`
	FileSizeBytes    int64                  `json:"file_size_bytes"`
	PageOrSlideCount int                    `json:"page_or_slide_count"`
	EstimatedMinutes int                    `json:"estimated_minutes"`
	Description      string                 `json:"description"`
	Slides           []AcademyDocumentSlide `json:"slides"`
}

type AcademyExternalResource struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Type        string `json:"type"` // cheatsheet | link | formula_sheet | dataset
	Description string `json:"description"`
	URL         string `json:"url,omitempty"`
}

type AcademyFlashcard struct {
	ID             string   `json:"id"`
	Question       string   `json:"question"`
	Answer         string   `json:"answer"`
	Explanation    string   `json:"explanation"`
	Difficulty     string   `json:"difficulty"`
	SourceModuleID string   `json:"source_module_id"`
	SourceSection  string   `json:"source_section"`
	Tags           []string `json:"tags"`
}

type AcademyQuizQuestion struct {
	ID              string   `json:"id"`
	Type            string   `json:"type"` // multiple_choice | true_false | multiple_answer | scenario
	Question        string   `json:"question"`
	Options         []string `json:"options,omitempty"`
	CorrectAnswers  []int    `json:"correct_answers"`
	Explanation     string   `json:"explanation"`
	Hint            string   `json:"hint,omitempty"`
	ScenarioContext string   `json:"scenario_context,omitempty"`
	Difficulty      string   `json:"difficulty"`
	TopicTag        string   `json:"topic_tag"`
}

type AcademyModuleQuiz struct {
	ID                     string                `json:"id"`
	Title                  string                `json:"title"`
	DurationMinutes        int                   `json:"duration_minutes"`
	PassingScorePercentage int                   `json:"passing_score_percentage"`
	Questions              []AcademyQuizQuestion `json:"questions"`
}

type AcademyReferralUnlock struct {
	Enabled           bool `json:"enabled"`
	RequiredReferrals int  `json:"required_referrals"`
}

// AcademyModule is one learning unit. Protected payloads are blanked by the
// server before they reach a student whose access to that resource is locked.
type AcademyModule struct {
	ID                  string                      `json:"id"`
	ChapterID           string                      `json:"chapter_id"`
	SubjectID           string                      `json:"subject_id"`
	StreamID            string                      `json:"stream_id"`
	LevelID             string                      `json:"level_id"`
	Title               string                      `json:"title"`
	Description         string                      `json:"description"`
	Order               int                         `json:"order"`
	Difficulty          string                      `json:"difficulty"`
	EstimatedMinutes    int                         `json:"estimated_minutes"`
	AccessStatus        string                      `json:"access_status"`
	ResourceAccess      map[string]string           `json:"resource_access"`
	ReferralUnlock      AcademyReferralUnlock       `json:"referral_unlock"`
	PublishStatus       string                      `json:"publish_status"`
	LearningObjectives  []string                    `json:"learning_objectives"`
	ReadingMarkdown     string                      `json:"reading_markdown"`
	VideoLesson         *AcademyVideoLesson         `json:"video_lesson"`
	DocumentAttachments []AcademyDocumentAttachment `json:"document_attachments"`
	FlashcardDeck       []AcademyFlashcard          `json:"flashcard_deck"`
	Quiz                *AcademyModuleQuiz          `json:"quiz"`
	Resources           []AcademyExternalResource   `json:"resources"`
	UpdatedAt           string                      `json:"updated_at,omitempty"`
	CreatedAt           string                      `json:"created_at,omitempty"`
}

// AcademyAiDraft is an AI-generated artefact waiting for admin review.
type AcademyAiDraft struct {
	ID         string                `json:"id"`
	ModuleID   string                `json:"module_id"`
	Kind       string                `json:"kind"`   // flashcards | quiz | summary | key_concepts
	Status     string                `json:"status"` // pending | approved | rejected
	Source     string                `json:"source"` // markdown | transcript | document
	Flashcards []AcademyFlashcard    `json:"flashcards,omitempty"`
	Questions  []AcademyQuizQuestion `json:"questions,omitempty"`
	Text       *string               `json:"text,omitempty"`
	Items      []string              `json:"items,omitempty"`
	CreatedAt  string                `json:"created_at"`
}

/* ------------------------------ student side ------------------------------ */

type AcademyStudent struct {
	ID            string `json:"id"`
	FullName      string `json:"full_name"`
	FirstName     string `json:"first_name"`
	Grade         string `json:"grade"`
	LevelID       string `json:"level_id"`
	StreamID      string `json:"stream_id"`
	IsPremium     bool   `json:"is_premium"`
	ReferralCount int    `json:"referral_count"`
	TargetScore   int    `json:"target_score"`
	AvatarURL     string `json:"avatar_url,omitempty"`
}

type AcademyModuleProgress struct {
	ReadPercentage      int    `json:"read_percentage"`
	VideoTimeSeconds    int    `json:"video_time_seconds"`
	VideoCompleted      bool   `json:"video_completed"`
	DocumentCurrentPage int    `json:"document_current_page"`
	DocumentCompleted   bool   `json:"document_completed"`
	Completed           bool   `json:"completed"`
	LastStudiedAt       string `json:"last_studied_at"`
}

type AcademyQuizAttempt struct {
	ID             string   `json:"id"`
	ModuleID       string   `json:"module_id"`
	QuizID         string   `json:"quiz_id"`
	Score          int      `json:"score"`
	TotalQuestions int      `json:"total_questions"`
	Percentage     int      `json:"percentage"`
	Passed         bool     `json:"passed"`
	CompletedAt    string   `json:"completed_at"`
	WeakTopics     []string `json:"weak_topics"`
	Source         string   `json:"source,omitempty"` // module | ai
}

type AcademyFlashcardProgress struct {
	DeckModuleID   string   `json:"deck_module_id"`
	MasteredIDs    []string `json:"mastered_ids"`
	StrugglingIDs  []string `json:"struggling_ids"`
	LastReviewedAt string   `json:"last_reviewed_at"`
	RecallRate     int      `json:"recall_rate"`
}

// AcademyStudentState is the persisted per-student learning state (one
// document per student, optimistic-locked through Version).
type AcademyStudentState struct {
	// Runtime-only (never persisted): per-program entitlement set.
	AccessSet         bool                                `json:"-" dynamodbav:"-"`
	ProgramAccess     map[string]bool                     `json:"-" dynamodbav:"-"`
	StudentID         string                              `json:"student_id"`
	LevelID           string                              `json:"level_id"`
	StreamID          string                              `json:"stream_id"`
	TargetScore       int                                 `json:"target_score"`
	ModuleProgress    map[string]AcademyModuleProgress    `json:"module_progress"`
	FlashcardProgress map[string]AcademyFlashcardProgress `json:"flashcard_progress"`
	QuizAttempts      []AcademyQuizAttempt                `json:"quiz_attempts"`
	TotalMinutes      int                                 `json:"total_minutes"`
	RecentModuleID    string                              `json:"recent_module_id"`
	ActiveDays        []string                            `json:"active_days"`
	// Referrals: module id -> unique friend ids who joined through this
	// student's referral link for that module.
	Referrals  map[string][]string `json:"referrals"`
	ReferredBy string              `json:"referred_by,omitempty"`
	Version    int64               `json:"version"`
	CreatedAt  string              `json:"created_at"`
	UpdatedAt  string              `json:"updated_at"`
}
