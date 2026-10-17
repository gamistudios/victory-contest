import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BookCheck, Crown, GraduationCap, Library, TrendingUp, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AccessBadge } from "@/features/lectures/components/AccessBadge";
import { InlineError } from "@/features/lectures/components/States";
import { ProgressBar } from "@/features/lectures/components/ProgressRing";
import { useAsync } from "@/features/lectures/hooks/useAsync";
import { adminGetAnalytics } from "@/services/academy/academyApi";
import type { AdminAnalytics } from "@/types/academy";
import { cn } from "@/lib/utils";
import { Chip, PageTitle, Panel, PanelTitle, StatTile } from "./components/kit";

type Row = AdminAnalytics["modules"][number];
type SortKey = "views" | "completion_rate" | "quiz_avg" | "abandon_rate";
const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "views", label: "Views" },
  { key: "completion_rate", label: "Completion" },
  { key: "quiz_avg", label: "Quiz avg" },
  { key: "abandon_rate", label: "Drop-off" },
];

const axis = { fill: "hsl(var(--chart-axis))", fontSize: 12 };
const tooltipStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))", fontSize: 12 };

function Metric({ label, value, suffix = "%", barClass = "bg-blue-fix-600" }: { label: string; value: number; suffix?: string; barClass?: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-semibold text-muted-foreground">{label}</span>
        <span className="font-bold text-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <ProgressBar value={suffix === "%" ? value : Math.min(100, value)} barClass={barClass} className="h-2.5" />
    </div>
  );
}

function ChartBox({ title, summary, children, height = 240 }: { title: string; summary: string; children: React.ReactElement; height?: number }) {
  return (
    <Panel>
      <PanelTitle>{title}</PanelTitle>
      <p className="sr-only">{summary}</p>
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

export default function Analytics() {
  const { data, loading, error, reload } = useAsync(adminGetAnalytics, []);
  const [sort, setSort] = useState<SortKey>("views");
  const [desc, setDesc] = useState(true);
  const [all, setAll] = useState(false);
  const [pick, setPick] = useState<string>("");

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data.modules].sort((a, b) => (desc ? b[sort] - a[sort] : a[sort] - b[sort]));
  }, [data, sort, desc]);

  if (loading && !data)
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading analytics">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  if (error || !data) return <InlineError message={error} onRetry={reload} />;

  const shown = all ? sorted : sorted.slice(0, 8);
  const sel: Row | undefined = data.modules.find((m) => m.id === pick) ?? sorted[0];
  const weekTotal = data.weekly_active.reduce((n, d) => n + d.free + d.premium, 0);
  const setSortKey = (k: SortKey) => {
    if (k === sort) setDesc((d) => !d);
    else {
      setSort(k);
      setDesc(true);
    }
  };
  const dirLabel = desc ? "descending" : "ascending";

  return (
    <div className="space-y-4">
      <PageTitle title="Analytics" hint="How students use the academy" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Users} label="Enrolments" value={data.total_enrollments.toLocaleString()} />
        <StatTile icon={Crown} label="Free to premium" value={`${data.free_to_premium_rate}%`} tone="bg-yellow-100 text-yellow-800" />
        <StatTile icon={BookCheck} label="Published" value={`${data.published_modules}/${data.total_modules}`} tone="bg-green-100 text-green-800" sub="modules" />
        <StatTile icon={Library} label="Premium modules" value={data.premium_modules} tone="bg-purple-100 text-purple-700" />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ChartBox title="Weekly active students" summary={`${weekTotal} active sessions this week. ${data.weekly_active.map((d) => `${d.day}: ${d.free} free, ${d.premium} premium`).join("; ")}.`}>
          <BarChart data={data.weekly_active} margin={{ left: -16, right: 4, top: 8 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--chart-grid))" />
            <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={false} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={44} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} />
            <Legend iconType="square" wrapperStyle={{ fontSize: 12, color: "hsl(var(--chart-axis))" }} />
            <Bar dataKey="free" name="Free" stackId="a" fill="hsl(var(--chart-1))" />
            <Bar dataKey="premium" name="Premium" stackId="a" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartBox>

        <ChartBox title="Completion by level" summary={`Completion percent by level: ${data.engagement_by_level.map((l) => `${l.level} ${l.completion}% (${l.students} students)`).join("; ")}.`}>
          <BarChart data={data.engagement_by_level} layout="vertical" margin={{ left: 4, right: 36, top: 4 }}>
            <CartesianGrid horizontal={false} stroke="hsl(var(--chart-grid))" />
            <XAxis type="number" domain={[0, 100]} tick={axis} tickLine={false} axisLine={false} unit="%" />
            <YAxis type="category" dataKey="level" tick={axis} tickLine={false} axisLine={false} width={72} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} formatter={(v) => [`${v}%`, "Completion"]} />
            <Bar dataKey="completion" name="Completion" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} label={{ position: "right", fill: "hsl(var(--chart-axis))", fontSize: 12, formatter: (v: unknown) => `${v}%` }} />
          </BarChart>
        </ChartBox>
      </div>

      <Panel>
        <PanelTitle icon={GraduationCap}>By stream</PanelTitle>
        <ul className="grid gap-3 sm:grid-cols-3">
          {data.engagement_by_stream.map((s) => (
            <li key={s.stream} className="rounded-xl bg-muted/50 p-3">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-sm font-bold">{s.stream}</span>
                <span className="text-xs text-muted-foreground">{s.students.toLocaleString()} students</span>
              </div>
              <Metric label="Completion" value={s.completion} barClass="bg-purple-fix-600" />
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <PanelTitle icon={TrendingUp}>Module ranking</PanelTitle>
        <div className="mb-3 flex gap-2 overflow-x-auto scrollbar-hide lg:hidden" role="group" aria-label="Sort by">
          {SORTS.map((s) => (
            <Chip key={s.key} active={sort === s.key} onClick={() => setSortKey(s.key)}>
              {s.label}
              {sort === s.key && (desc ? <ArrowDown className="h-4 w-4" aria-hidden /> : <ArrowUp className="h-4 w-4" aria-hidden />)}
            </Chip>
          ))}
        </div>
        <p className="sr-only" aria-live="polite">
          Sorted by {SORTS.find((s) => s.key === sort)?.label}, {dirLabel}
        </p>

        <ol className="space-y-2 lg:hidden">
          {shown.map((r, i) => (
            <li key={r.id} className="rounded-xl border border-border bg-background p-3">
              <div className="flex items-start gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{r.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.subject_name}</p>
                </div>
                <AccessBadge access={r.access_status} compact />
              </div>
              <dl className="mt-2 grid grid-cols-4 gap-2 text-center">
                {[["Views", r.views.toLocaleString()], ["Done", `${r.completion_rate}%`], ["Quiz", `${r.quiz_avg}%`], ["Drop", `${r.abandon_rate}%`]].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-muted/60 py-1.5">
                    <dt className="text-[10px] font-semibold uppercase text-muted-foreground">{k}</dt>
                    <dd className="text-sm font-bold">{v}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-sm">
            <caption className="sr-only">Modules ranked by {SORTS.find((s) => s.key === sort)?.label}</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-bold">Module</th>
                <th scope="col" className="px-3 font-bold">Access</th>
                {SORTS.map((s) => (
                  <th key={s.key} scope="col" aria-sort={sort === s.key ? (desc ? "descending" : "ascending") : "none"} className="px-3 text-right">
                    <button type="button" onClick={() => setSortKey(s.key)} className="inline-flex min-h-11 items-center gap-1 font-bold uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {s.label}
                      {sort === s.key ? desc ? <ArrowDown className="h-3.5 w-3.5" aria-hidden /> : <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : null}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="max-w-[280px] py-2 pr-3">
                    <p className="truncate font-semibold">{r.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.subject_name}</p>
                  </td>
                  <td className="px-3"><AccessBadge access={r.access_status} /></td>
                  <td className="px-3 text-right tabular-nums">{r.views.toLocaleString()}</td>
                  <td className="px-3 text-right tabular-nums">{r.completion_rate}%</td>
                  <td className="px-3 text-right tabular-nums">{r.quiz_avg}%</td>
                  <td className="px-3 text-right tabular-nums">{r.abandon_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sorted.length > 8 && (
          <button type="button" onClick={() => setAll((a) => !a)} className="mt-3 h-11 w-full rounded-xl bg-muted text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {all ? "Show top 8" : `Show all ${sorted.length}`}
          </button>
        )}
      </Panel>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel>
          <PanelTitle>Weakest topics</PanelTitle>
          <ul className="space-y-3">
            {data.weakest_topics.map((t) => (
              <li key={t.topic}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-bold">{t.topic}</p>
                  <span className="shrink-0 text-sm font-extrabold text-rose-700">{t.error_rate}% wrong</span>
                </div>
                <ProgressBar value={t.error_rate} barClass="bg-rose-fix-600" className="my-1 h-2.5" />
                <p className="text-xs text-muted-foreground">
                  {t.subject} · {t.students_affected} students
                </p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelTitle>Module metrics</PanelTitle>
          {sel && (
            <div className="space-y-3">
              <Select value={sel.id} onValueChange={setPick}>
                <SelectTrigger aria-label="Choose module" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {data.modules.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="min-h-11">
                      {m.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className={cn("grid gap-3")}>
                <Metric label="Completion" value={sel.completion_rate} barClass="bg-green-fix-600" />
                <Metric label="Video watched" value={sel.video_completion} barClass="bg-blue-fix-600" />
                <Metric label="Flashcard recall" value={sel.flashcard_recall} barClass="bg-purple-fix-600" />
                <Metric label="Quiz average" value={sel.quiz_avg} barClass="bg-amber-fix-600" />
                <Metric label="Drop-off" value={sel.abandon_rate} barClass="bg-rose-fix-600" />
                <Metric label="Avg time" value={sel.avg_minutes} suffix=" min" barClass="bg-teal-fix-600" />
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
