// Phase 4 student client for GET /api/feed (plan §5.7). The student id comes from the session token.
import api from "@/services/api";
import type { AssessmentMeta } from "@/features/assessments/api";

export interface FeedScope { program_id: string; stream_id?: string; subject_id?: string }
export interface FeedLecture {
  id: string; name: string; code: string; level_id: string; stream_id: string; description: string;
  icon_name: string; color_theme: string; chapters_count: number; total_modules_count: number;
  completed_modules: number; progress_percentage: number; locked_modules: number;
  scope: FeedScope; access: "free" | "mixed" | "premium";
}
export interface FeedBoardEntry { rank: number; name: string; points: number; avatar_url?: string }
export interface FeedBoard { program_id: string; stream_id?: string; period: string; top: FeedBoardEntry[]; me?: FeedBoardEntry }
export interface Feed {
  program_id: string; stream_id: string; mine: boolean; programs: string[];
  assessments: AssessmentMeta[]; lectures: FeedLecture[]; leaderboards: FeedBoard[]; next_cursor?: string;
}
export interface FeedQuery { program?: string; stream?: string; subject?: string; kind?: string; access?: string; cursor?: string }

/** program omitted = the active (primary) program, "mine" = all enrolments, or any program id (Explore). */
export async function fetchFeed(q: FeedQuery = {}, signal?: AbortSignal): Promise<Feed> {
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(q)) if (v) params[k] = v;
  const { data } = await api.get<Feed>("/feed", { params, signal });
  return data;
}
