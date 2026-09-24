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
