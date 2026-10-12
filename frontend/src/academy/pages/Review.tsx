import { ChevronRight, Layers, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { getDashboard, getSubjectOutline } from "@/services/academy/academyApi";
import { useAsync } from "../hooks/useAsync";
import { CardSkeleton, EmptyState, InlineError } from "../components/States";
import { ProgressRing } from "../components/ProgressRing";
import { toneFor } from "../lib/theme";

/** Review hub: every flashcard deck the student can open, sorted by what needs work. */
export default function Review() {
  const { data, loading, error, reload } = useAsync(async () => {
    const d = await getDashboard();
    const outlines = await Promise.all(d.subjects.map((s) => getSubjectOutline(s.id)));
    const rows = outlines.flatMap((o) => o.chapters.flatMap((c) => c.modules.filter((m) => m.has_flashcards && !m.is_locked).map((m) => ({ m, subject: o.subject, started: o.progress.started_ids.includes(m.id) || o.progress.completed_ids.includes(m.id) }))));
    return { due: d.flashcards_due, rows };
  }, []);

  if (error) return <div className="p-4"><InlineError message={error} onRetry={reload} /></div>;
  if (loading || !data) return <div className="space-y-3 p-4">{[0, 1, 2, 3].map((i) => <CardSkeleton key={i} className="h-20" />)}</div>;
  const rows = [...data.rows].sort((a, b) => Number(b.started) - Number(a.started));

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-4 rounded-3xl bg-gradient-to-br from-violet-fix-700 to-violet-fix-500 p-5 text-white">
        <ProgressRing value={Math.min(100, data.due * 8)} size={64} stroke={6} arcClass="stroke-white" trackClass="stroke-white/25" className="[&>div]:text-white"><span className="text-lg font-extrabold">{data.due}</span></ProgressRing>
        <div><p className="font-nunito text-xl font-extrabold">Cards to review</p><p className="text-sm text-white/80">Short sessions beat long ones</p></div>
      </div>
      {rows.length === 0 ? <EmptyState icon={<Layers className="h-6 w-6" />} title="No decks yet" hint="Open a lesson and tap Cards." /> : (
        <ul className="space-y-2.5">
          {rows.map(({ m, subject, started }) => {
            const tone = toneFor(subject.color_theme);
            return (
              <li key={m.id}>
                <Link to={`/academy/module/${m.id}?tab=cards`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 active:scale-[0.99]">
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tone.soft}`}><Layers className="h-6 w-6" /></span>
                  <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-bold leading-tight">{m.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{subject.name}</p></div>
                  {started ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800">In progress</span> : <Sparkles className="h-4 w-4 text-muted-foreground" />}
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
