// Phase 1 student-side pricing / entitlement / enrollment client (plan §5.2, §5.12).
// The server is the only source of truth for prices, coupons and access.
import { useCallback, useEffect, useState } from "react";
import api from "@/services/api";

export interface Money { currency: "ETB" | "XTR"; amount: number }
export interface Validity { type: "days" | "fixed_end" | "lifetime"; days?: number; ends_at?: string }
export interface PricePlan {
  id: string; name: string; description: string;
  program_ids: string[]; all_programs: boolean;
  validity: Validity; prices: Money[]; list_prices: Money[];
  sale?: { prices: Money[]; starts_at: string; ends_at: string };
  highlights: string[]; badge: string; sort_order: number;
}
export interface Quote {
  plan_id: string; currency: string; list_amount: number; price: number;
  discount: number; final: number; free: boolean; coupon_code?: string;
  validity: Validity; program_ids: string[]; all_programs: boolean;
}
export interface Entitlement {
  id: string; student_id: string; program_id: string;
  expires_at: string; source: string; last_plan_id: string;
}
export interface Enrollment {
  program_id: string; stream_id: string; enrolled_at: string;
  source: "self" | "admin" | "payment"; confirmed: boolean;
}
export interface Lock { state: "locked"; reason: "premium" | "referral"; program_id?: string }

export const GRACE_DEFAULT_DAYS = 3;

export async function listPlans(programId?: string): Promise<PricePlan[]> {
  const res = await api.get("/pricing", { params: programId ? { program_id: programId } : {} });
  return res.data?.plans ?? [];
}

export async function quotePlan(planId: string, currency: "ETB" | "XTR" = "ETB", couponCode = ""): Promise<Quote> {
  const res = await api.post("/pricing/quote", { plan_id: planId, currency, coupon_code: couponCode });
  return res.data;
}

export async function myEntitlements(): Promise<{ entitlements: Entitlement[]; grace_days: number }> {
  const res = await api.get("/me/entitlements");
  return { entitlements: res.data?.entitlements ?? [], grace_days: res.data?.grace_days ?? GRACE_DEFAULT_DAYS };
}

/** Append plan terms to the payment FormData; the server re-derives price/validity. */
export function withPlan(form: FormData, planId: string, currency: "ETB" | "XTR", couponCode?: string): FormData {
  form.set("plan_id", planId);
  form.set("currency", currency);
  if (couponCode) form.set("coupon_code", couponCode);
  return form;
}

export const isEntitled = (e: Entitlement | undefined, graceDays = GRACE_DEFAULT_DAYS, now = Date.now()) => {
  if (!e) return false;
  if (!e.expires_at) return true; // lifetime
  return now <= new Date(e.expires_at).getTime() + graceDays * 86_400_000;
};
export const inGrace = (e: Entitlement | undefined, graceDays = GRACE_DEFAULT_DAYS, now = Date.now()) =>
  !!e && !!e.expires_at && now > new Date(e.expires_at).getTime() && isEntitled(e, graceDays, now);

export async function myEnrollments(): Promise<{ enrollments: Enrollment[]; primary_program_id: string }> {
  const res = await api.get("/me/enrollments");
  return { enrollments: res.data?.enrollments ?? [], primary_program_id: res.data?.primary_program_id ?? "" };
}
export const enroll = (program_id: string, stream_id = "") =>
  api.post("/me/enrollments", { program_id, stream_id }).then((r) => r.data);
export const leaveProgram = (programId: string) =>
  api.delete(`/me/enrollments/${encodeURIComponent(programId)}`).then((r) => r.data);
export const setPrimaryProgram = (program_id: string) =>
  api.put("/me/enrollments/primary", { program_id }).then((r) => r.data);

export function useEntitlements() {
  const [data, setData] = useState<{ byProgram: Record<string, Entitlement>; grace: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await myEntitlements();
      setData({ byProgram: Object.fromEntries(r.entitlements.map((e) => [e.program_id, e])), grace: r.grace_days });
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { data, loading, reload };
}
