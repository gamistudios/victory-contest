import api from "./api";

interface PracticeSettings {
  subject: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard" | "";
}

// The backend /api/ai gate answers 403 with this exact message when the
// admin has switched AI to premium-only and the caller is not a premium
// student (see backend ai_handler.go aiPremiumRequiredMessage).
const PREMIUM_REQUIRED_MESSAGE =
  "AI features are available for premium students. Upgrade to start practicing.";

/**
 * True when an error from getAiGeneratedQuestions / getAiRecommendationsFromApi
 * is the backend's "premium required" 403, so callers can show an upgrade
 * prompt instead of the generic generation-failure toast.
 */
export function isPremiumRequiredError(err: unknown): boolean {
  const e = err as {
    response?: { status?: number; data?: { error?: unknown } };
  };
  return (
    e?.response?.status === 403 &&
    e?.response?.data?.error === PREMIUM_REQUIRED_MESSAGE
  );
}

export async function getAiRecommendationsFromApi(data: {
  subject: string;
  chapters:
    | {
        [key: string]: {
          total: number;
          correct: number;
          accuracy: number;
        };
      }
    | undefined;
}) {
  const res = await api.post("/ai/getRecommendation", data);
  return res.data.recommendation;
}

export async function getAiGeneratedQuestions(setting: PracticeSettings) {
  const res = await api.post("/ai/practice", setting);
  return res.data.questions;
}

// --- Stored-bank practice (no LLM) ---
// The question bank already holds graded questions per subject, so practice
// for those subjects pulls straight from the bank instead of generating via
// an AI provider. This keeps practice working even when no provider is
// configured.

// Subjects that have stored questions, so the practice UI can offer them.
export async function getPracticeSubjects(): Promise<string[]> {
  const res = await api.get("/ai/subjects");
  return res.data.subjects as string[];
}

// Pull a practice session of stored questions for a subject (optionally
// scoped to a topic/chapter). Returns the bank questions, ready for the same
// session flow as AI-generated ones.
export async function getBankPracticeQuestions(
  subject: string,
  topic: string,
  count: number
) {
  const res = await api.post("/ai/practice-questions", {
    subject,
    topic,
    question_count: count,
  });
  return res.data.questions;
}

// --- On-question AI tutor (explain / ask) ---

export interface AIQuestionContext {
  question_text: string;
  multiple_choice: string[];
  answer: number;
  explanation?: string;
  subject?: string;
  grade?: string;
  chapter?: string;
  question_image?: string | null;
}

// aiExplain asks the on-question tutor for a guided explanation (askText "")
// or a follow-up answer (askText set). The full quiz — including the correct
// answers, which the model must not disclose — is sent as context. The
// backend answers {"reply": "<markdown>"}; the 403 premium contract is the
// same message the other /ai routes use, so isPremiumRequiredError covers
// this call automatically.
export async function aiExplain(
  quiz: AIQuestionContext[],
  focus: AIQuestionContext,
  askText: string
): Promise<string> {
  const res = await api.post("/ai/explain", {
    quiz,
    focus,
    ask_text: askText,
  });
  return res.data.reply as string;
}

// getAiSettings reads the admin AI-access switch so the student app can
// pre-lock the AI Practice entry for non-premium students (the 403 on the
// /ai routes remains the authoritative server-side guard).
export interface AiSettings {
  require_premium: boolean;
}

export async function getAiSettings(): Promise<AiSettings> {
  const res = await api.get("/ai/settings");
  return res.data as AiSettings;
}
