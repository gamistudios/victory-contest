// Phase 2 admin client for attempts (plan §5.4.2).
import api from "./api";

export interface AdminAttempt {
  id: string; contest_id: string; student_id: string; status: string; mode: string;
  started_at: string; submitted_at?: string; expires_at: string;
  correct: number; total: number; points: number; is_late: boolean;
  penalty_percent: number; penalty_waived: boolean; duration_seconds: number;
  excluded: boolean; excluded_reason?: string; answers?: Record<string, number>;
}
export type AttemptLabel = "" | "on_time" | "late" | "auto_submitted" | "abandoned" | "excluded";
export type AttemptAction = "exclude" | "waive_penalty" | "regrade" | "reset";

export const labelOf = (a: AdminAttempt): Exclude<AttemptLabel, ""> | "in_progress" =>
  a.excluded ? "excluded" : a.status === "abandoned" ? "abandoned" : a.status === "auto_submitted" ? "auto_submitted"
    : a.is_late ? "late" : a.status === "submitted" ? "on_time" : "in_progress";

export const listAttempts = (contestId: string, label: AttemptLabel = "") =>
  api.get(`/api/admin/assessments/${encodeURIComponent(contestId)}/attempts`, { params: label ? { label } : {} })
    .then((r) => (r.data ?? []) as AdminAttempt[]);
export const getAttempt = (id: string) => api.get(`/api/admin/attempts/${encodeURIComponent(id)}`).then((r) => r.data as AdminAttempt);
export const patchAttempt = (id: string, action: AttemptAction, reason = "") =>
  api.patch(`/api/admin/attempts/${encodeURIComponent(id)}`, { action, reason }).then((r) => r.data as AdminAttempt);
export const attemptsCsvUrl = (contestId: string, label: AttemptLabel = "") =>
  `/api/admin/assessments/${encodeURIComponent(contestId)}/attempts.csv${label ? `?label=${label}` : ""}`;
export async function downloadAttemptsCsv(contestId: string, label: AttemptLabel = "") {
  const res = await api.get(attemptsCsvUrl(contestId, label), { responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url; a.download = `attempts-${contestId}.csv`; a.click();
  URL.revokeObjectURL(url);
}
export const getAttemptCounts = () =>
  api.get("/api/admin/attempt-counts").then((r) => (r.data ?? {}) as Record<string, number>);
