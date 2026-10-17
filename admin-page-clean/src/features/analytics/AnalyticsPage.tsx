// Phase 5 scope analytics (plan §Phase 5): program / stream / subject / region dashboards,
// score distribution, competency heat-map and CSV export - all driven by the shared scope
// filter (program, stream, subject) plus a date range. Built next to AssessmentStatistics /
// StudentStatistics (which stay as the per-contest / per-student views).
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Download, Percent, Sparkles, Trophy, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTitle, Panel, PanelTitle, Segmented, StatTile, inputCls } from "@/features/lectures/admin/components/kit";
import { getAdminCatalog } from "@/services/catalogServices";
import { useScope } from "@/app/ProgramContext";
import { errorText, exportAnalyticsCsv, getScopeAnalytics, type AnalyticsSection, type ScopeParams } from "./api";
import BreakdownTable from "./BreakdownTable";
import CompetencyHeatmap from "./CompetencyHeatmap";
import ScoreDistribution from "./ScoreDistribution";

const TABS: { value: AnalyticsSection; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "program", label: "Programs" },
  { value: "stream", label: "Streams" },
  { value: "subject", label: "Subjects" },
  { value: "region", label: "Regions" },
  { value: "distribution", label: "Scores" },
  { value: "competency", label: "Competency" },
];

export default function AnalyticsPage() {
  const headerScope = useScope(); // header "Working in" switcher seeds the filter (plan 5.8)
  const [tab, setTab] = useState<AnalyticsSection>("overview");
  const [program, setProgram] = useState(headerScope.program);
  const [stream, setStream] = useState(headerScope.stream);
  const [subject, setSubject] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);
  useEffect(() => { setProgram(headerScope.program); setStream(headerScope.stream); setSubject(""); }, [headerScope.program, headerScope.stream]);

  const catalog = useQuery({ queryKey: ["admin-catalog"], queryFn: () => getAdminCatalog() });
  const programs = catalog.data?.programs ?? [];
  const streams = (catalog.data?.streams ?? []).filter((s) => {
    if (!program) return true;
    const p = programs.find((x) => x.id === program);
    return !p || (p.available_streams ?? []).length === 0 || (p.available_streams as string[]).includes(s.id);
  });
  const subjects = (catalog.data?.subjects ?? []).filter((s) => (!program || s.level_id === program) && (!stream || !s.stream_id || s.stream_id === stream));

  const names = useMemo(() => {
    const pm = new Map(programs.map((p) => [p.id as string, p.name]));
    const sm = new Map((catalog.data?.streams ?? []).map((s) => [s.id as string, s.name]));
    const subm = new Map((catalog.data?.subjects ?? []).map((s) => [s.id, s.name]));
    const cm = new Map((catalog.data?.chapters ?? []).map((c) => [c.id, c.title]));
    return {
      program: (id?: string) => (id ? pm.get(id) ?? id : "—"),
      stream: (id?: string) => (id ? sm.get(id) ?? id : "—"),
      subject: (id?: string) => (id ? subm.get(id) ?? id : "—"),
      chapter: (id?: string) => (id ? cm.get(id) ?? id : "Whole subject"),
    };
  }, [programs, catalog.data]);

  const params: ScopeParams = useMemo(() => ({
    program_id: program ? [program] : undefined,
    stream_id: stream ? [stream] : undefined,
    subject_id: subject || undefined,
    from: from || undefined,
    to: to || undefined,
  }), [program, stream, subject, from, to]);

  const dateBad = !!from && !!to && from > to;
  const q = useQuery({ queryKey: ["scope-analytics", params], queryFn: () => getScopeAnalytics(params), enabled: !dateBad });
  const a = q.data;

  const doExport = async () => {
    setExporting(true);
    try { await exportAnalyticsCsv(tab, params); } catch (e) { toast.error(errorText(e)); } finally { setExporting(false); }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4">
      <PageTitle
        title="Analytics"
        hint="Finished attempts across the selected scope. Legacy submissions without a scope are not counted."
        action={<Button variant="secondary" className="h-11 gap-1.5 rounded-xl" onClick={doExport} disabled={exporting || dateBad}><Download className="h-4 w-4" aria-hidden /> {exporting ? "Exporting…" : "Export CSV"}</Button>}
      />

      <Panel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-semibold text-muted-foreground">Program
            <select className={inputCls} value={program} onChange={(e) => { setProgram(e.target.value); setStream(""); setSubject(""); }}>
              <option value="">All programs</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted-foreground">Stream
            <select className={inputCls} value={stream} onChange={(e) => { setStream(e.target.value); setSubject(""); }}>
              <option value="">All streams</option>
              {streams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted-foreground">Subject
            <select className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">All subjects</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted-foreground">From
            <input type="date" className={inputCls} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">To
            <input type="date" className={inputCls} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        {dateBad && <p className="mt-2 text-sm text-red-600">“From” must not be after “To”.</p>}
      </Panel>

      <div className="overflow-x-auto">
        <Segmented<AnalyticsSection> label="Analytics view" value={tab} onChange={setTab} options={TABS} />
      </div>

      {q.isError && <Panel><p className="text-sm text-red-600">{errorText(q.error)}</p></Panel>}
      {q.isLoading && <Skeleton className="h-48 w-full rounded-2xl" />}

      {a && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatTile icon={ClipboardList} label="Attempts" value={a.totals.attempts.toLocaleString()} />
            <StatTile icon={Users} label="Students" value={a.totals.students.toLocaleString()} tone="bg-emerald-100 text-emerald-700" />
            <StatTile icon={Percent} label="Average" value={`${a.totals.avg_percent.toFixed(1)}%`} sub={`median ${a.totals.median_percent.toFixed(1)}%`} tone="bg-amber-100 text-amber-700" />
            <StatTile icon={CheckCircle2} label="Pass rate" value={`${a.totals.pass_rate.toFixed(1)}%`} sub="50% pass line" tone="bg-violet-100 text-violet-700" />
            <StatTile icon={Trophy} label="Total points" value={a.totals.total_points.toLocaleString()} tone="bg-rose-100 text-rose-700" />
          </div>

          {tab === "overview" && (
            <>
              <Panel>
                <PanelTitle icon={Sparkles}>Summary</PanelTitle>
                <p className="text-sm text-foreground">{a.summary || "Not enough data for a summary yet."}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">{!a.summary_source || a.summary_source.startsWith("rule_based") ? "Rule-based summary (AI summary not enabled)." : `Source: ${a.summary_source}`}</p>
              </Panel>
              <Panel><PanelTitle>Score distribution</PanelTitle><ScoreDistribution bins={a.distribution} /></Panel>
            </>
          )}
          {tab === "program" && <Panel><PanelTitle>By program</PanelTitle><BreakdownTable kind="program" rows={a.by_program} names={names} /></Panel>}
          {tab === "stream" && <Panel><PanelTitle>By stream</PanelTitle><BreakdownTable kind="stream" rows={a.by_stream} names={names} /></Panel>}
          {tab === "subject" && <Panel><PanelTitle>By subject</PanelTitle><BreakdownTable kind="subject" rows={a.by_subject} names={names} /></Panel>}
          {tab === "region" && <Panel><PanelTitle>By region</PanelTitle><BreakdownTable kind="region" rows={a.by_region} names={names} /></Panel>}
          {tab === "distribution" && <Panel><PanelTitle>Score distribution</PanelTitle><ScoreDistribution bins={a.distribution} /></Panel>}
          {tab === "competency" && <Panel><PanelTitle>Competency (mastery per subject / chapter)</PanelTitle><CompetencyHeatmap cells={a.competency} names={names} /></Panel>}
          <p className="text-right text-[11px] text-muted-foreground">Generated {new Date(a.generated_at).toLocaleString()} (cached up to 30 s)</p>
        </>
      )}
    </div>
  );
}
