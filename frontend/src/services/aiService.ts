import api from "./api";

interface PracticeSettings {
  subject: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard" | "";
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
