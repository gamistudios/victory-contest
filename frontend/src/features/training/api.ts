// Phase 6 student client (plan §5.10). The student id always comes from the session token; the date is
// server-derived (Africa/Addis_Ababa), so nothing here sends or trusts a client date. No ranking, no points.
import { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/services/api";
import { myEnrollments, type Lock } from "@/shared/pricing/api";
import { useCatalog } from "@/shared/scope/catalog";
import { ensureStudentSession } from "@/services/telegramServices";

export interface HabitPlanView {
  id: string; program_id: string; title: string; access: "free" | "premium";
  days_count: number; started: boolean; current_streak: number; lock?: Lock;
}
export interface HabitItemState { id: string; label: string; done: boolean }
export interface HabitCalendarDay { day: number; date: string; done: number; total: number; state: "complete" | "partial" | "missed" | "upcoming"; is_today: boolean }
export interface HabitBadge { id: string; name: string; description: string; rarity: string; earned_date: string }
export interface HabitToday {
  plan_id: string; title: string; date: string; start_date: string; day_number: number; days_count?: number; finished: boolean;
  day_title: string; items: HabitItemState[]; current_streak: number; best_streak: number; total_done: number;
  completion_pct: number; calendar: HabitCalendarDay[]; badges_earned?: HabitBadge[];
}
export interface HabitTrack {
  plan_id: string; title: string; program_id: string; start_date: string; day_number: number; days_count?: number; finished: boolean;
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


export interface TrainingOverview {
  loading: boolean; error: boolean; reload: () => void;
  /** Student is enrolled in a program that offers habits. */
  enabled: boolean;
  plans: HabitPlanView[]; me: HabitMe | null;
  /** Active habits programs the student has not joined yet (so we can invite them). */
  joinable: { id: string; name: string }[];
  progressOf: (planId: string) => HabitTrack | undefined;
}

/** One load for every Training surface (Home, Practice, /training): plans + the student's own progress + enrolment. */
export function useTrainingOverview(): TrainingOverview {
  const { catalog } = useCatalog();
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [plans, setPlans] = useState<HabitPlanView[]>([]);
  const [me, setMe] = useState<HabitMe | null>(null);
  const [joined, setJoined] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    ensureStudentSession()
      .then(() => Promise.all([
        myEnrollments().then((e) => [e.primary_program_id, ...e.enrollments.map((x) => x.program_id)].filter(Boolean)).catch(() => [] as string[]),
        listHabitPlans(),
        getHabitMe().catch(() => null),
      ]))
      .then(([progs, pl, m]) => { if (!alive) return; setJoined(progs); setPlans(pl); setMe(m); setError(false); })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tick]);

  const habitPrograms = useMemo(() => (catalog?.programs ?? []).filter((p) => p.is_active && p.features?.includes("habits")), [catalog]);
  const enabled = habitPrograms.some((p) => joined.includes(p.id));
  const joinable = useMemo(
    () => habitPrograms.filter((p) => !joined.includes(p.id)).map((p) => ({ id: p.id, name: p.name })),
    [habitPrograms, joined],
  );
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const progressOf = useCallback((id: string) => me?.tracks.find((t) => t.plan_id === id), [me]);
  return { loading, error, reload, enabled, plans, me, joinable, progressOf };
}
