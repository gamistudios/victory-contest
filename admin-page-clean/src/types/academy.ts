/**
 * Victory Academy — shared types (API contract).
 *
 * Wire format follows the Go backend conventions used by victory-contest:
 *  - snake_case JSON keys
 *  - list endpoints respond with a named envelope: { subjects: [...] }
 *  - single resources respond with { subject: {...} }
 *  - errors respond with { error: "message" }
 *
 * Everything the future Go `domain` structs need to expose is modelled here,
 * so swapping the mock adapter for the real backend does not touch the UI.
 */

/* ----------------------------- taxonomy ----------------------------- */

export type LevelId = string; // program id (data-driven)

export type StreamId = string; // stream id (data-driven; "common" is always allowed)

export type Difficulty =
  | "Beginner"
  | "Intermediate"
  | "Advanced"
  | "Easy"
  | "Medium"
  | "Hard";

export type Access = "free" | "premium";
export type PublishStatus = "published" | "draft" | "scheduled" | "archived";

/** Every learning resource on a module can be locked on its own. */
export type ResourceKey =
  | "reading"
  | "video"
  | "documents"
  | "flashcards"
  | "quiz"
  | "ai_tutor";

export const RESOURCE_KEYS: ResourceKey[] = [
  "reading",
  "video",
  "documents",
  "flashcards",
  "quiz",
  "ai_tutor",
];

export type ResourceAccessMap = Partial<Record<ResourceKey, Access>>;
export type ResourceLocks = Record<ResourceKey, boolean>;

export interface Program {
  id: LevelId;
  name: string;
  short_code: string;
  description: string;
  icon_name: string;
  available_streams: StreamId[];
  target_exam_year?: string;
  total_modules_count?: number;
  is_active: boolean;
  kind?: string;
  group?: string;
  features?: string[];
  grade?: string;
  sort_order?: number;
  open_for_registration?: boolean;
}

export interface Stream {
  id: StreamId;
  name: string;
  description: string;
  icon_name: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  level_id: LevelId;
  stream_id: StreamId;
  description: string;
  icon_name: string;
  color_theme: string;
  chapters_count: number;
  total_modules_count: number;
}

export interface Chapter {
  id: string;
  subject_id: string;
  title: string;
  order_number: number;
  description: string;
  is_premium: boolean;
  module_ids: string[];
}

/* ----------------------------- resources ----------------------------- */

export interface TranscriptItem {
  id: string;
  timestamp_seconds: number;
  time_str: string;
  text: string;
}

export interface VideoLesson {
  id: string;
  title: string;
  type: "direct" | "youtube";
  url: string;
  duration_seconds: number;
  instructor_name: string;
  instructor_role: string;
  instructor_avatar?: string;
  /** Markdown */
  description: string;
  transcript: TranscriptItem[];
}

export interface DocumentSlide {
  slide_number: number;
  title: string;
  key_points: string[];
  notes?: string;
  diagram_title?: string;
  diagram_svg_type?: string;
}

export interface DocumentAttachment {
  id: string;
  title: string;
  type: "pdf" | "pptx";
  url: string;
  file_size_bytes: number;
  page_or_slide_count: number;
  estimated_minutes: number;
  description: string;
  slides: DocumentSlide[];
}

export interface ExternalResource {
  id: string;
  title: string;
  type: "cheatsheet" | "link" | "formula_sheet" | "dataset";
  description: string;
  url?: string;
}

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
  explanation: string;
  difficulty: Difficulty;
  source_module_id: string;
  source_section: string;
  tags: string[];
}

export type QuestionType =
  | "multiple_choice"
  | "true_false"
  | "multiple_answer"
  | "scenario";

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  question: string;
  options?: string[];
  correct_answers: number[];
  explanation: string;
  hint?: string;
  scenario_context?: string;
  difficulty: Difficulty;
  topic_tag: string;
}

export interface ModuleQuiz {
  id: string;
  title: string;
  duration_minutes: number;
  passing_score_percentage: number;
  questions: QuizQuestion[];
}

export interface ReferralUnlock {
  enabled: boolean;
  required_referrals: number;
}

/** A learning unit. `reading_markdown` & friends are blanked by the server when locked. */
export interface LearningModule {
  id: string;
  chapter_id: string;
  subject_id: string;
  stream_id: StreamId;
  level_id: LevelId;
  title: string;
  description: string;
  order: number;
  difficulty: Difficulty;
  estimated_minutes: number;
  access_status: Access;
  /** Per-resource overrides; falls back to access_status. */
  resource_access: ResourceAccessMap;
  referral_unlock: ReferralUnlock;
  publish_status: PublishStatus;
  learning_objectives: string[];
  reading_markdown: string;
  video_lesson?: VideoLesson | null;
  document_attachments: DocumentAttachment[];
  flashcard_deck: Flashcard[];
  quiz?: ModuleQuiz | null;
  resources: ExternalResource[];
  updated_at?: string;
  created_at?: string;
}

/** Light row used inside the course outline. */
export interface ModuleSummary {
  id: string;
  chapter_id: string;
  title: string;
  order: number;
  difficulty: Difficulty;
  estimated_minutes: number;
  access_status: Access;
  is_locked: boolean;
  has_video: boolean;
  has_documents: boolean;
  has_flashcards: boolean;
  has_quiz: boolean;
  publish_status: PublishStatus;
}

export interface ChapterOutline extends Omit<Chapter, "module_ids"> {
  is_locked: boolean;
  modules: ModuleSummary[];
}

/* ----------------------------- student ----------------------------- */

export interface AcademyStudent {
  id: string;
  full_name: string;
  first_name: string;
  grade: string;
  level_id: LevelId;
  stream_id: StreamId;
  is_premium: boolean;
  referral_count: number;
  target_score: number;
  avatar_url?: string;
}

export interface ModuleProgress {
  read_percentage: number;
  video_time_seconds: number;
  video_completed: boolean;
  document_current_page: number;
  document_completed: boolean;
  completed: boolean;
  last_studied_at: string;
}

export interface QuizAttempt {
  id: string;
  module_id: string;
  quiz_id: string;
  score: number;
  total_questions: number;
  percentage: number;
  passed: boolean;
  completed_at: string;
  weak_topics: string[];
  source?: "module" | "ai";
}

export interface FlashcardProgress {
  deck_module_id: string;
  mastered_ids: string[];
  struggling_ids: string[];
  last_reviewed_at: string;
  recall_rate: number;
}

export interface StudentProgress {
  overall_completion_percentage: number;
  study_streak_days: number;
  total_minutes_studied: number;
  completed_module_ids: string[];
  module_progress: Record<string, ModuleProgress>;
  quiz_attempts: QuizAttempt[];
  flashcard_progress: Record<string, FlashcardProgress>;
  recent_module_id: string;
}

export interface SubjectWithProgress extends Subject {
  completed_modules: number;
  progress_percentage: number;
  locked_modules: number;
}

export interface WeakArea {
  topic: string;
  subject_id: string;
  subject_name: string;
  error_rate: number;
  module_id?: string;
}

export interface DashboardData {
  student: AcademyStudent;
  streak_days: number;
  week_activity: boolean[]; // Mon..Sun
  total_minutes_studied: number;
  overall_completion: number;
  completed_modules: number;
  total_modules: number;
  continue_module: (ModuleSummary & { subject_id: string; subject_name: string; subject_color: string; progress: number }) | null;
  recommended_module: (ModuleSummary & { subject_id: string; subject_name: string; subject_color: string; reason: string }) | null;
  subjects: SubjectWithProgress[];
  flashcards_due: number;
  weak_areas: WeakArea[];
  recent_quiz_attempts: QuizAttempt[];
  target: { target_score: number; current_average: number };
  notice?: { id: string; text: string; tone: "info" | "success" | "warning" } | null;
}

/* --------------------------- module detail --------------------------- */

export interface ModuleNeighbor {
  id: string;
  title: string;
  is_locked: boolean;
}

export interface ModuleDetailResponse {
  module: LearningModule;
  locks: ResourceLocks;
  /** true when every resource is locked for this student */
  fully_locked: boolean;
  progress: ModuleProgress | null;
  flashcard_progress: FlashcardProgress | null;
  subject: Pick<Subject, "id" | "name" | "color_theme" | "icon_name" | "level_id" | "stream_id">;
  chapter: Pick<Chapter, "id" | "title" | "order_number">;
  prev: ModuleNeighbor | null;
  next: ModuleNeighbor | null;
  referral: { enabled: boolean; required: number; current: number; unlocked: boolean };
  counts: {
    flashcards: number;
    quiz_questions: number;
    documents: number;
    has_video: boolean;
  };
}

/* ------------------------------- AI ------------------------------- */

export type TutorMode = "chat" | "explain" | "analogy" | "example" | "summary";

export interface TutorMessage {
  role: "user" | "assistant";
  content: string;
}

export interface QuizGenerateRequest {
  module_id: string;
  count: number;
  difficulty: Difficulty | "Mixed";
  types?: QuestionType[];
}

export interface FlashcardGenerateRequest {
  module_id: string;
  count: number;
  difficulty: Difficulty | "Mixed";
}

/* ------------------------------ admin ------------------------------ */

export type AiDraftKind = "flashcards" | "quiz" | "summary" | "key_concepts";
export type AiDraftStatus = "pending" | "approved" | "rejected";

export interface AiDraft {
  id: string;
  module_id: string;
  kind: AiDraftKind;
  status: AiDraftStatus;
  source: "markdown" | "transcript" | "document";
  flashcards?: Flashcard[];
  questions?: QuizQuestion[];
  text?: string;
  items?: string[];
  created_at: string;
}

export interface AdminTreeSubject extends Subject {
  chapters: Array<
    Chapter & {
      modules: Array<
        Pick<
          LearningModule,
          | "id"
          | "title"
          | "order"
          | "access_status"
          | "publish_status"
          | "difficulty"
          | "estimated_minutes"
        > & { has_video: boolean; flashcards: number; questions: number; documents: number }
      >;
    }
  >;
}

export interface AdminAnalytics {
  total_enrollments: number;
  free_to_premium_rate: number;
  total_modules: number;
  published_modules: number;
  premium_modules: number;
  modules: Array<{
    id: string;
    title: string;
    subject_name: string;
    views: number;
    completion_rate: number;
    avg_minutes: number;
    video_completion: number;
    flashcard_recall: number;
    quiz_avg: number;
    abandon_rate: number;
    access_status: Access;
  }>;
  weakest_topics: Array<{
    topic: string;
    subject: string;
    error_rate: number;
    students_affected: number;
  }>;
  engagement_by_level: Array<{ level: string; students: number; completion: number }>;
  engagement_by_stream: Array<{ stream: string; students: number; completion: number }>;
  weekly_active: Array<{ day: string; free: number; premium: number }>;
}

/** Create / update payload for the module editor. */
export type ModuleInput = Partial<Omit<LearningModule, "id" | "created_at" | "updated_at">> & {
  chapter_id: string;
  title: string;
};
