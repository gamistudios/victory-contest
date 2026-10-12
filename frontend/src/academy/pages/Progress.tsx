import { Award, CheckCircle2, Clock, Flame, Minus, Plus, Target, XCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { getDashboard, getQuizAttempts, setTargetScore } from "@/services/academy/academyApi";
import { useAsync } from "../hooks/useAsync";
import { useAcademy } from "../context/AcademyContext";
import { CardSkeleton, InlineError } from "../components/States";
import { ProgressRing } from "../components/ProgressRing";
import { SectionTitle } from "../components/PageHeader";
import { toneFor, fmtMinutes } from "../lib/theme";

export default function Progress() {
  const { data, loading, error, reload } = useAsync(async () => ({ d: await getDashboard(), attempts: await getQuizAttempts() }), []);
  const { setStudent } = useAcademy();
  const [saving, setSaving] = useState(false);

  if (error) return <div className="p-4"><InlineError message={error} onRetry={reload} /></div>;
  if (loading || !data) return <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <CardSkeleton key={i} className="h-32" />)}</div>;
  const { d, attempts } = data;

  const changeTarget = async (delta: number) => {
    const t = Math.min(100, Math.max(30, d.target.target_score + delta));
    setSaving(true);
    try {
      setStudent(await setTargetScore(t));
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const chart = d.subjects.map((s) => ({ name: s.name.replace(/\(.*\)/, "").trim().split(" ")[0], pct: s.progress_percentage, id: s.id }));
  const gap = Math.max(0, d.target.target_score - d.target.current_average);

  return (
    <div className="space-y-5 p-4">
      <div className="grid grid-cols-3 gap-3">
        <Kpi icon={<Flame className="h-5 w-5 text-orange-fix-600" />} value={d.streak_days} label="Day streak" />
        <Kpi icon={<CheckCircle2 className="h-5 w-5 text-green-700" />} value={`${d.completed_modules}/${d.total_modules}`} label="Lessons" />
        <Kpi icon={<Clock className="h-5 w-5 text-blue-700" />} value={fmtMinutes(d.total_minutes_studied)} label="Studied" />
      </div>

      <section className="rounded-3xl border border-border bg-card p-4">
        <div className="flex items-center gap-4">
          <ProgressRing value={d.target.target_score ? (d.target.current_average / d.target.target_score) * 100 : 0} size={88} stroke={9} arcClass="stroke-green-fix-600">
            <Target className="h-7 w-7 text-green-700" />
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Target score</p>
            <p className="font-nunito text-3xl font-extrabold">
              {d.target.current_average}
              <span className="text-lg text-muted-foreground"> / {d.target.target_score}</span>
            </p>
            <p className="text-sm font-semibold text-muted-foreground">{gap > 0 ? `${gap} points to go` : "You've reached your target 🎉"}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-center gap-4">
          <button disabled={saving} onClick={() => changeTarget(-5)} aria-label="Lower target" className="flex h-11 w-11 items-center justify-center rounded-full bg-muted active:scale-95">
            <Minus className="h-5 w-5" />
          </button>
          <span className="w-16 text-center text-sm font-bold">Goal {d.target.target_score}</span>
          <button disabled={saving} onClick={() => changeTarget(5)} aria-label="Raise target" className="flex h-11 w-11 items-center justify-center rounded-full bg-muted active:scale-95">
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </section>

      <section>
        <SectionTitle>Subject progress</SectionTitle>
        <div className="rounded-2xl border border-border bg-card p-3">
          <p className="sr-only">{chart.map((c) => `${c.name} ${c.pct}%`).join(", ")}</p>
          <div className="h-48" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--chart-grid))" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--chart-axis))" }} axisLine={false} tickLine={false} interval={0} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--chart-axis))" }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))" }}
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--foreground))" }}
                  formatter={(v) => [`${v}%`, "Complete"]}
                />
                <Bar dataKey="pct" radius={[6, 6, 0, 0]}>
                  {chart.map((c, i) => (
                    <Cell key={c.id} fill={`hsl(var(--chart-${(i % 5) + 1}))`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <ul className="mt-3 space-y-2">
          {d.subjects.map((s) => (
            <li key={s.id}>
              <Link to={`/academy/subject/${s.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <span className={`h-3 w-3 rounded-full ${toneFor(s.color_theme).bar}`} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.name}</span>
                <span className="text-xs font-bold text-muted-foreground">{s.progress_percentage}%</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {d.weak_areas.length > 0 && (
        <section>
          <SectionTitle>Weak areas</SectionTitle>
          <ul className="space-y-2">
            {d.weak_areas.map((w) => (
              <li key={w.topic}>
                <Link to={w.module_id ? `/academy/module/${w.module_id}?tab=quiz` : "/academy/courses"} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{w.topic}</span>
                    <span className="text-xs text-muted-foreground">{w.subject_name}</span>
                  </span>
                  <span className="w-20">
                    <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full bg-red-fix-500" style={{ width: `${w.error_rate}%` }} />
                    </span>
                  </span>
                  <span className="w-9 text-right text-xs font-bold">{w.error_rate}%</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionTitle>Quiz history</SectionTitle>
        {attempts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Take a quiz to see your results here.</p>
        ) : (
          <ul className="space-y-2">
            {attempts.slice(0, 8).map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-extrabold">{a.percentage}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {a.score}/{a.total_questions} correct{a.source === "ai" ? " · AI" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">{new Date(a.completed_at).toLocaleDateString()}</p>
                </div>
                {a.passed ? <Award className="h-5 w-5 text-green-700" aria-label="Passed" /> : <XCircle className="h-5 w-5 text-red-700" aria-label="Not passed" />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kpi({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card p-3 text-center">
      {icon}
      <span className="text-lg font-extrabold leading-none">{value}</span>
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
    </div>
  );
}
