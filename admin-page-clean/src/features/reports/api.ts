// Phase 5 revenue report client (GET /api/admin/reports/revenue). Mirrors backend domain/revenue.go.
// Money is whole ETB birr (integers). Telegram Stars are reported separately, never mixed in.
import api from "@/services/api";
import { cleanParams, downloadCsv } from "@/lib/download";

export interface RevenueRow { key: string; label: string; payments: number; revenue_etb: number }
export interface RevenueTotals {
  revenue_etb: number; payments: number; refunded_etb: number; refunded: number;
  free_grants: number; stars_revenue_xtr: number; legacy_payments: number;
}
export interface RevenueReport {
  from?: string; to?: string; program_ids?: string[];
  totals: RevenueTotals;
  by_program: RevenueRow[]; by_plan: RevenueRow[]; by_coupon: RevenueRow[]; by_month: RevenueRow[];
  generated_at: string;
}
export type RevenueGroup = "month" | "program" | "plan" | "coupon";
export interface RevenueParams { program_id?: string[]; from?: string; to?: string }

const ENDPOINT = "/api/admin/reports/revenue";

export const getRevenueReport = (p: RevenueParams): Promise<RevenueReport> =>
  api.get<RevenueReport>(ENDPOINT, { params: cleanParams({ ...p }) }).then((r) => ({
    ...r.data,
    by_program: r.data.by_program ?? [], by_plan: r.data.by_plan ?? [],
    by_coupon: r.data.by_coupon ?? [], by_month: r.data.by_month ?? [],
  }));

export const exportRevenueCsv = (group: RevenueGroup, p: RevenueParams) =>
  downloadCsv(ENDPOINT, { ...p, group_by: group }, `revenue-by-${group}.csv`);

export const errorText = (e: unknown): string => {
  const r = (e as { response?: { status?: number; data?: { error?: string } } })?.response;
  if (r?.status === 403) return r.data?.error ?? "You do not have access to revenue reports.";
  return r?.data?.error ?? (e instanceof Error ? e.message : "Could not load the revenue report.");
};
