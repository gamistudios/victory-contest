/**
 * Typed service layer for Victory Academy. Same style as contestApi.ts /
 * articleService.ts in victory-contest: thin axios calls that unwrap the
 * Go-style envelope ({ subjects: [...] }, { module: {...} }, ...).
 */
import api from "../api";
import type {
  AcademyStudent,
  AdminAnalytics,
  AdminTreeSubject,
  AiDraft,
  AiDraftKind,
  ChapterOutline,
  DashboardData,
  Difficulty,
  Flashcard,
  FlashcardGenerateRequest,
  LearningModule,
  LevelId,
  ModuleDetailResponse,
  ModuleInput,
  ModuleProgress,
  ModuleQuiz,
  Program,
  PublishStatus,
  QuizAttempt,
  QuizGenerateRequest,
  Stream,
  StreamId,
  Subject,
  SubjectWithProgress,
  TutorMode,
  Chapter,
  Access,
  ResourceAccessMap,
  ReferralUnlock,
  FlashcardProgress,
} from "@/types/academy";

export type ProgramWithCount = Program & { subjects_count: number };

/* ------------------------------ student ------------------------------ */

export const getMe = async (): Promise<AcademyStudent> => (await api.get("/academy/me")).data.student;

export const updateMe = async (patch: { level_id?: LevelId; stream_id?: StreamId }): Promise<AcademyStudent> =>
  (await api.patch("/academy/me", patch)).data.student;

export const setTargetScore = async (target_score: number): Promise<AcademyStudent> =>
  (await api.put("/academy/me/target", { target_score })).data.student;

export const getDashboard = async (): Promise<DashboardData> => (await api.get("/academy/dashboard")).data.dashboard;

export const getPrograms = async (): Promise<{ programs: ProgramWithCount[]; streams: Stream[] }> =>
  (await api.get("/academy/programs")).data;

export const getSubjects = async (params?: { level_id?: LevelId; stream_id?: StreamId }): Promise<SubjectWithProgress[]> =>
  (await api.get("/academy/subjects", { params })).data.subjects;

export const getSubjectOutline = async (id: string): Promise<{ subject: SubjectWithProgress; chapters: ChapterOutline[]; progress: { completed_ids: string[]; started_ids: string[] } }> =>
  (await api.get(`/academy/subjects/${id}`)).data;

export const getModule = async (id: string): Promise<ModuleDetailResponse> => (await api.get(`/academy/modules/${id}`)).data;

export const postModuleProgress = async (
  id: string,
  patch: Partial<Pick<ModuleProgress, "read_percentage" | "video_time_seconds" | "video_completed" | "document_current_page" | "document_completed">>,
): Promise<ModuleProgress> => (await api.post(`/academy/modules/${id}/progress`, patch)).data.progress;

export const completeModule = async (id: string, completed = true): Promise<{ progress: ModuleProgress; overall_completion: number }> =>
  (await api.post(`/academy/modules/${id}/complete`, { completed })).data;

export const claimReferral = async (referrer_id: string, module_id: string) =>
  (await api.post(`/academy/referrals/claim`, { referrer_id, module_id })).data.referral as { enabled: boolean; required: number; current: number; unlocked: boolean };

export const postFlashcardReview = async (module_id: string, mastered_ids: string[], struggling_ids: string[]): Promise<FlashcardProgress> =>
  (await api.post("/academy/flashcard-reviews", { module_id, mastered_ids, struggling_ids })).data.flashcard_progress;

export const postQuizAttempt = async (body: {
  module_id: string;
  quiz_id: string;
  score: number;
  total_questions: number;
  weak_topics: string[];
  source?: "module" | "ai";
  passing?: number;
}): Promise<QuizAttempt> => (await api.post("/academy/quiz-attempts", body)).data.attempt;

export const getQuizAttempts = async (module_id?: string): Promise<QuizAttempt[]> =>
  (await api.get("/academy/quiz-attempts", { params: { module_id } })).data.attempts;

/* --------------------------------- AI --------------------------------- */

export const aiGenerateFlashcards = async (req: FlashcardGenerateRequest): Promise<Flashcard[]> =>
  (await api.post("/academy/ai/flashcards", req)).data.flashcards;

export const aiGenerateQuiz = async (req: QuizGenerateRequest): Promise<ModuleQuiz> =>
  (await api.post("/academy/ai/quiz", req)).data.quiz;

export const aiTutor = async (body: { module_id: string; message: string; mode: TutorMode; selection?: string }): Promise<string> =>
  (await api.post("/academy/ai/tutor", body)).data.reply;

/* -------------------------------- admin -------------------------------- */

export const adminGetTree = async (params?: { level_id?: LevelId; stream_id?: StreamId | "all" }) =>
  (await api.get("/academy/admin/tree", { params })).data as { tree: AdminTreeSubject[]; programs: Program[]; streams: Stream[] };

export const adminGetModule = async (id: string) =>
  (await api.get(`/academy/admin/modules/${id}`)).data as { module: LearningModule; chapter: Chapter; subject: Subject };

export const adminCreateModule = async (input: ModuleInput): Promise<LearningModule> =>
  (await api.post("/academy/admin/modules", input)).data.module;

export const adminUpdateModule = async (id: string, input: Partial<LearningModule>): Promise<LearningModule> =>
  (await api.put(`/academy/admin/modules/${id}`, input)).data.module;

export const adminDeleteModule = async (id: string): Promise<void> => {
  await api.delete(`/academy/admin/modules/${id}`);
};

export const adminDuplicateModule = async (id: string): Promise<LearningModule> =>
  (await api.post(`/academy/admin/modules/${id}/duplicate`)).data.module;

export const adminSetAccess = async (
  id: string,
  body: { access_status?: Access; resource_access?: ResourceAccessMap; referral_unlock?: ReferralUnlock },
): Promise<LearningModule> => (await api.patch(`/academy/admin/modules/${id}/access`, body)).data.module;

export const adminSetStatus = async (id: string, publish_status: PublishStatus): Promise<LearningModule> =>
  (await api.patch(`/academy/admin/modules/${id}/status`, { publish_status })).data.module;

export const adminReorderModule = async (id: string, direction: "up" | "down"): Promise<void> => {
  await api.post(`/academy/admin/modules/${id}/reorder`, { direction });
};

export const adminCreateChapter = async (body: { subject_id: string; title: string; description?: string; is_premium?: boolean }): Promise<Chapter> =>
  (await api.post("/academy/admin/chapters", body)).data.chapter;

export const adminUpdateChapter = async (id: string, body: Partial<Pick<Chapter, "title" | "description" | "is_premium">>): Promise<Chapter> =>
  (await api.put(`/academy/admin/chapters/${id}`, body)).data.chapter;

export const adminDeleteChapter = async (id: string): Promise<void> => {
  await api.delete(`/academy/admin/chapters/${id}`);
};

export const adminReorderChapter = async (id: string, direction: "up" | "down"): Promise<void> => {
  await api.post(`/academy/admin/chapters/${id}/reorder`, { direction });
};

export const adminCreateSubject = async (body: Partial<Subject> & { name: string }): Promise<Subject> =>
  (await api.post("/academy/admin/subjects", body)).data.subject;

export const adminSetProgramActive = async (id: LevelId, is_active: boolean): Promise<Program> =>
  (await api.patch(`/academy/admin/programs/${id}`, { is_active })).data.program;

export const adminGenerateDrafts = async (body: {
  module_id: string;
  kinds: AiDraftKind[];
  count?: number;
  difficulty?: Difficulty | "Mixed";
  source?: AiDraft["source"];
}): Promise<AiDraft[]> => (await api.post("/academy/admin/ai/generate", body)).data.drafts;

export const adminGetDrafts = async (module_id?: string): Promise<AiDraft[]> =>
  (await api.get("/academy/admin/ai-drafts", { params: { module_id } })).data.drafts;

export const adminUpdateDraft = async (id: string, body: Partial<Pick<AiDraft, "status" | "flashcards" | "questions" | "text" | "items">>): Promise<AiDraft> =>
  (await api.patch(`/academy/admin/ai-drafts/${id}`, body)).data.draft;

export const adminDeleteDraft = async (id: string): Promise<void> => {
  await api.delete(`/academy/admin/ai-drafts/${id}`);
};

export const adminGetAnalytics = async (): Promise<AdminAnalytics> => (await api.get("/academy/admin/analytics")).data.analytics;
