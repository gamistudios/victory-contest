// Phase 3 admin client for the precomputed boards (plan §5.5). View-only.
import api from "@/services/api";

export type Period = "day" | "week" | "month" | "all";
export interface BoardEntry {
  rank: number; student_id: string; name: string; region?: string;
  points: number; attempts: number; avg_percent: number; seconds: number; late: boolean;
}
export interface BoardView { period: string; program_id: string; stream_id?: string; board_key: string; entries: BoardEntry[] }

export const getAdminBoard = (p: { contest_id?: string; period?: Period; program?: string; stream?: string }) =>
  api.get<BoardView>("/api/admin/leaderboard", { params: p }).then((r) => r.data);
