// Phase 2 student client for the attempt engine (plan §5.4.2).
// The student id always comes from the session token; nothing here sends one.
import api from "@/services/api";
import type { Lock } from "@/shared/pricing/api";

export interface Scope { program_id: string; stream_id: string; subject_id?: string; chapter_id?: string }
export interface MyAttempt { id: string; status: string; expires_at: string; is_late: boolean; correct: number; total: number; points: number }
export interface AssessmentMeta {
  id: string; title: string; description: string; kind: string; mode: "self_paced" | "global";
  access: string; scope?: Scope; start_time: string; end_time: string; duration_minutes: number;
  late_penalty_percent: number; reveal: "at_end" | "on_submit"; question_count: number;
  year?: string; source?: string; lock?: Lock; my_attempt?: MyAttempt; registered?: boolean; needs_registration?: boolean; server_now: string;
}
export interface Attempt {
  id: string; contest_id: string; status: "in_progress" | "submitted" | "auto_submitted" | "abandoned";
  started_at: string; expires_at: string; submitted_at?: string; answers_version: number;
  answers?: Record<string, number>; flagged?: string[]; order?: string[]; correct: number; total: number; points: number;
  is_late: boolean; penalty_percent: number; penalty_waived: boolean; duration_seconds: number;
}
export interface PublicQuestion {
  id: string; question_text: string; question_image: string; multiple_choice: string[]; option_images?: string[];
}
export interface StartResult { attempt: Attempt; questions: PublicQuestion[]; server_now: string; resumed: boolean }
export interface EditorialItem {
  id: string; question_text: string; question_image: string; multiple_choice: string[]; option_images?: string[];
  answer: number; explanation: string; explanation_image: string; user_answer: number; is_correct: boolean;
}
export interface ResultView {
  attempt: Attempt; answers_visible: boolean; reveal_at?: string; editorial?: EditorialItem[]; server_now: string;
}
export interface LeaderboardRow {
  rank: number; student_id: string; name: string; imgurl: string; points: number; correct: number;
  total: number; is_late: boolean; duration_seconds: number;
}

export const enc = encodeURIComponent;

export async function listAssessments(filter: { program_id?: string; stream_id?: string } = {}): Promise<AssessmentMeta[]> {
  const res = await api.get("/assessments", { params: filter });
  return res.data ?? [];
}
export async function getAssessment(id: string): Promise<AssessmentMeta> {
  return (await api.get(`/assessments/${enc(id)}`)).data;
}
export async function startAssessment(id: string): Promise<StartResult> {
  return (await api.post(`/assessments/${enc(id)}/start`)).data;
}
export async function autosave(attemptId: string, answers: Record<string, number>, flagged: string[], version: number) {
  return (await api.put(`/attempts/${enc(attemptId)}/answers`, { answers, flagged, version })).data as { version: number; server_now: string };
}
export async function submitAttempt(attemptId: string, answers?: Record<string, number>): Promise<Attempt> {
  return (await api.post(`/attempts/${enc(attemptId)}/submit`, answers ? { answers } : {})).data;
}
export async function getResult(attemptId: string): Promise<ResultView> {
  return (await api.get(`/attempts/${enc(attemptId)}/result`)).data;
}
export async function assessmentLeaderboard(id: string): Promise<LeaderboardRow[]> {
  return (await api.get(`/assessments/${enc(id)}/leaderboard`)).data ?? [];
}

export interface EditorialView {
  title: string; visible: boolean; participated: boolean; message?: string;
  editorial?: EditorialItem[]; server_now: string;
}

/** The roster step the legacy contest card required before joining. Idempotent. */
export async function registerForAssessment(id: string): Promise<void> {
  await api.post(`/assessments/${enc(id)}/register`);
}

/** Walkthrough of a closed assessment, for students who never attempted it. */
export async function getAssessmentEditorial(id: string): Promise<EditorialView> {
  return (await api.get(`/assessments/${enc(id)}/editorial`)).data;
}
