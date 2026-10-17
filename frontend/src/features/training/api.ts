// Phase 6 student client (plan §5.10). The student id always comes from the session token; the date is
// server-derived (Africa/Addis_Ababa), so nothing here sends or trusts a client date. No ranking, no points.
import { useEffect, useState } from "react";
import api from "@/services/api";
import { myEnrollments, type Lock } from "@/shared/pricing/api";
import { useCatalog } from "@/shared/scope/catalog";

export interface HabitPlanView {
  id: string; program_id: string; title: string; access: "free" | "premium";
  days_count: number; started: boolean; current_streak: number; lock?: Lock;
}
export interface HabitItemState { id: string; label: string; done: boolean }
export interface HabitCalendarDay { day: number; date: string; done: number; total: number; state: "complete" | "partial" | "missed" | "upcoming"; is_today: boolean }
export interface HabitBadge { id: string; name: string; description: string; rarity: string; earned_date: string }
export interface HabitToday {
  plan_id: string; title: string; date: string; start_date: string; day_number: number; finished: boolean;
  day_title: string; items: HabitItemState[]; current_streak: number; best_streak: number; total_done: number;
  completion_pct: number; calendar: HabitCalendarDay[]; badges_earned?: HabitBadge[];
}
export interface HabitTrack {
  plan_id: string; title: string; program_id: string; start_date: string; day_number: number; finished: boolean;
  current_streak: number; best_streak: number; total_done: number; completion_pct: number; last_active_at: string;
}
export interface HabitMe { tracks: HabitTrack[]; badges: HabitBadge[] }

export const listHabitPlans = () => api.get("/habits/plans").then((r) => (r.data?.plans ?? []) as HabitPlanView[]);
export const startHabit = (plan_id: string) => api.post<HabitToday>("/habits/start", { plan_id }).then((r) => r.data);
export const getHabitToday = (plan_id: string) => api.get<HabitToday>("/habits/today", { params: { plan_id } }).then((r) => r.data);
export const checkHabit = (plan_id: string, item_id: string) => api.put<HabitToday>("/habits/check", { plan_id, item_id }).then((r) => r.data);
export const getHabitMe = () => api.get<HabitMe>("/habits/me").then((r) => r.data);

/** True only for a student enrolled in a program whose features include "habits". */
export function useTrainingEnabled(): boolean {
  const { catalog } = useCatalog();
  const [programs, setPrograms] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    myEnrollments()
      .then((e) => alive && setPrograms([e.primary_program_id, ...e.enrollments.map((x) => x.program_id)].filter(Boolean)))
      .catch(() => alive && setPrograms([]));
    return () => { alive = false; };
  }, []);
  if (!catalog || !programs) return false;
  return catalog.programs.some((p) => programs.includes(p.id) && p.features?.includes("habits"));
}
