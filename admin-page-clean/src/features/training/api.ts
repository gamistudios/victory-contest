// Phase 6 Training & Habit admin client. Mirrors backend domain/habit.go and usecase/habit_usecase.go.
import api from "@/services/api";

export interface HabitItem { id: string; label: string }
export interface HabitDay { day: number; title: string; items: HabitItem[] }
export type HabitAccess = "free" | "premium";
export interface HabitPlan {
  id: string; program_id: string; title: string; days: HabitDay[]; access: HabitAccess; is_active: boolean;
  /** Admin-chosen length of the track (1-365). Plans saved before this existed omit it and mean 30. */
  days_count?: number;
}
export const DEFAULT_TRACK_DAYS = 30;
export const MAX_TRACK_DAYS = 365;
export const planDays = (p: { days_count?: number }) => (p.days_count && p.days_count > 0 ? p.days_count : DEFAULT_TRACK_DAYS);
export interface OversightRow {
  student_id: string; student_name: string; plan_id: string; plan_title: string; program_id: string;
  start_date: string; day_number: number; days_count?: number; finished: boolean; current_streak: number; best_streak: number;
  completion_pct: number; last_active_at: string; days_inactive: number;
}
export interface OversightParams { program_id?: string; plan_id?: string; inactive_days?: number; order?: "asc" | "desc" }

const BASE = "/api/admin/habits";

export const listHabitPlans = (program_id?: string) =>
  api.get(`${BASE}/plans`, { params: program_id ? { program_id } : {} }).then((r) => (r.data?.plans ?? []) as HabitPlan[]);
export const saveHabitPlan = (p: Omit<HabitPlan, "id"> & { id?: string }) =>
  (p.id ? api.put(`${BASE}/plans/${p.id}`, p) : api.post(`${BASE}/plans`, p)).then((r) => r.data as HabitPlan);
export const deleteHabitPlan = (id: string) => api.delete(`${BASE}/plans/${id}`);
export const getOversight = (p: OversightParams) =>
  api.get(`${BASE}/oversight`, { params: { ...p, inactive_days: p.inactive_days || undefined, program_id: p.program_id || undefined, plan_id: p.plan_id || undefined } })
    .then((r) => (r.data?.rows ?? []) as OversightRow[]);
export const sendNudge = (student_id: string, plan_id: string, message?: string) =>
  api.post(`${BASE}/nudge`, { student_id, plan_id, message: message ?? "" });
