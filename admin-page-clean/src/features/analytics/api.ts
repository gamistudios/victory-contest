// Phase 5 admin client for the scope analytics (GET /api/admin/analytics/*).
// Mirrors backend domain/analytics.go. Admin axios client: full /api paths.
import api from "@/services/api";
import { cleanParams, downloadCsv } from "@/lib/download";

export interface ScopeParams {
  program_id?: string[];
  stream_id?: string[];
  subject_id?: string;
  chapter_id?: string;
  from?: string; // YYYY-MM-DD
  to?: string;
}

export interface AnalyticsTotals {
  attempts: number; students: number; avg_percent: number; median_percent: number; pass_rate: number; total_points: number;
}
export interface AnalyticsBucket {
  key: string; program_id?: string; stream_id?: string; subject_id?: string; region?: string;
  attempts: number; students: number; avg_percent: number; pass_rate: number; avg_points: number;
}
export interface DistributionBin { from: number; to: number; count: number }
export interface CompetencyCell {
  program_id: string; subject_id: string; chapter_id?: string;
  attempts: number; students: number; correct: number; total: number; mastery: number;
}
export interface ScopeAnalytics {
  totals: AnalyticsTotals;
  by_program: AnalyticsBucket[]; by_stream: AnalyticsBucket[]; by_subject: AnalyticsBucket[]; by_region: AnalyticsBucket[];
  distribution: DistributionBin[]; competency: CompetencyCell[];
  summary: string; summary_source: string; generated_at: string;
}

export type AnalyticsSection = "overview" | "program" | "stream" | "subject" | "region" | "distribution" | "competency";

const B = "/api/admin/analytics";

/** One request carries every section; the dashboards slice it client-side. */
export const getScopeAnalytics = (p: ScopeParams): Promise<ScopeAnalytics> =>
  api.get<ScopeAnalytics>(`${B}/overview`, { params: cleanParams({ ...p }) }).then((r) => ({
    ...r.data,
    by_program: r.data.by_program ?? [], by_stream: r.data.by_stream ?? [],
    by_subject: r.data.by_subject ?? [], by_region: r.data.by_region ?? [],
    distribution: r.data.distribution ?? [], competency: r.data.competency ?? [],
  }));

export const exportAnalyticsCsv = (section: AnalyticsSection, p: ScopeParams) =>
  downloadCsv(`${B}/${section}`, { ...p }, `analytics-${section}.csv`);

export const errorText = (e: unknown): string => {
  const r = (e as { response?: { status?: number; data?: { error?: string } } })?.response;
  if (r?.status === 403) return r.data?.error ?? "You do not have access to this scope.";
  return r?.data?.error ?? (e instanceof Error ? e.message : "Could not load analytics.");
};
