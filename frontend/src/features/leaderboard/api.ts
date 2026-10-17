// Phase 3 student client for the precomputed boards (plan §5.5). Student id comes from the session token.
import api from "@/services/api";

export type Period = "day" | "week" | "month" | "all";
export interface BoardEntry {
  rank: number; student_id: string; name: string; avatar_url?: string; region?: string;
  points: number; attempts: number; avg_percent: number; seconds: number; late: boolean;
}
export interface BoardView {
  period: string; program_id: string; stream_id?: string; board_key: string;
  entries: BoardEntry[]; me?: BoardEntry;
}
export interface BoardEnrollment { program_id: string; stream_id?: string }
export interface BoardPrograms { primary_program_id: string; enrollments: BoardEnrollment[] }

export const getBoard = (period: Period, program?: string, stream?: string) =>
  api.get<BoardView>("/leaderboard", { params: { period, program, stream } }).then((r) => r.data);
export const getBoardPrograms = () =>
  api.get<BoardPrograms>("/leaderboard/programs").then((r) => r.data);
