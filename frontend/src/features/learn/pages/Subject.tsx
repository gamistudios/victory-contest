import { Check, ChevronDown, Circle, FileText, Layers, Lock, PenLine, Play, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getSubjectOutline } from "@/services/academy/academyApi";
import type { ChapterOutline, ModuleSummary } from "@/types/academy";
import { useAsync } from "../hooks/useAsync";
import { useAcademy } from "../context/AcademyContext";
import { CardSkeleton, InlineError } from "../components/States";
import { ProgressRing } from "../components/ProgressRing";
import { BackButton } from "../components/PageHeader";
import { iconFor, toneFor, fmtMinutes } from "../lib/theme";
import { cn } from "@/lib/utils";

export default function Subject() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsync(() => getSubjectOutline(id), [id]);
  const { isPremium } = useAcademy();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (data) {
      const first = data.chapters.find((c) => c.modules.some((m) => !m.is_locked)) ?? data.chapters[0];
      if (first) setOpen((o) => (Object.keys(o).length ? o : { [first.id]: true }));
    }
  }, [data]);

  if (error) return <div className="p-4"><BackButton to="/academy/courses" /><div className="mt-4"><InlineError message={error} onRetry={reload} /></div></div>;
  if (loading || !data) return <div className="space-y-3 p-4"><CardSkeleton className="h-44" />{[0, 1, 2].map((i) => <CardSkeleton key={i} className="h-20" />)}</div>;

  const { subject: s, chapters } = data;
  const tone = toneFor(s.color_theme);
  const Icon = iconFor(s.icon_name);
  const all = chapters.flatMap((c) => c.modules);
  const progress: Prog = { completed: new Set(data.progress.completed_ids), started: new Set(data.progress.started_ids) };
  const nextMod = all.find((m) => !m.is_locked && !progress.completed.has(m.id)) ?? all[0];

  return (
    <div className="pb-28">
      <header className={cn("relative overflow-hidden bg-gradient-to-br px-4 pb-6 pt-safe text-white", tone.grad)}>
        <Icon className="absolute -right-6 top-4 h-44 w-44 text-white/10" aria-hidden />
        <div className="relative pt-3"><BackButton to="/academy/courses" className="bg-white/20 text-white" /></div>
        <div className="relative mt-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-nunito text-2xl font-extrabold leading-tight">{s.name}</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
              <Pill>{s.chapters_count} chapters</Pill>
              <Pill>{s.total_modules_count} lessons</Pill>
              {s.locked_modules > 0 && !isPremium && <Pill><Lock className="mr-1 inline h-3 w-3" />{s.locked_modules}</Pill>}
            </div>
          </div>
          <ProgressRing value={s.progress_percentage} size={64} stroke={6} arcClass="stroke-white" trackClass="stroke-white/25" className="text-white [&>div]:text-white" />
        </div>
      </header>

      <div className="space-y-3 p-4">
        {chapters.map((c, i) => <ChapterCard key={c.id} chapter={c} index={i + 1} open={!!open[c.id]} onToggle={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))} progress={progress} currentId={nextMod?.id} />)}
      </div>

      {nextMod && (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-3xl border-t border-border bg-card/95 p-3 pb-safe backdrop-blur-lg">
          <button onClick={() => navigate(`/academy/module/${nextMod.id}`)} className={cn("flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-bold", tone.solid)}>
            <Play className="h-5 w-5 fill-current" /> {progress.completed.size ? "Continue" : "Start learning"}
          </button>
        </div>
      )}
    </div>
  );
}

interface Prog { completed: Set<string>; started: Set<string> }

const Pill = ({ children }: { children: React.ReactNode }) => <span className="rounded-full bg-white/20 px-2.5 py-1">{children}</span>;

function ChapterCard({ chapter: c, index, open, onToggle, progress, currentId }: { chapter: ChapterOutline; index: number; open: boolean; onToggle: () => void; progress: Prog; currentId?: string }) {
  const done = c.modules.filter((m) => progress.completed.has(m.id)).length;
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 p-3 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted font-nunito text-lg font-extrabold">{index}</span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-bold leading-tight">{c.title.replace(/^Chapter \d+:\s*/, "")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{done}/{c.modules.length} done</p>
        </div>
        {c.is_premium && <Lock className="h-4 w-4 text-yellow-700" aria-label="Premium chapter" />}
        <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="border-t border-border">
          {c.modules.length === 0 && <li className="p-4 text-center text-xs text-muted-foreground">No lessons yet</li>}
          {c.modules.map((m) => <ModuleRow key={m.id} m={m} done={progress.completed.has(m.id)} started={progress.started.has(m.id)} current={m.id === currentId} />)}
        </ul>
      )}
    </section>
  );
}

function ModuleRow({ m, done, started, current }: { m: ModuleSummary; done: boolean; started: boolean; current: boolean }) {
  const Status = m.is_locked ? Lock : done ? Check : current || started ? Play : Circle;
  return (
    <li>
      <Link to={`/academy/module/${m.id}`} className={cn("flex min-h-[3.5rem] items-center gap-3 border-b border-border/60 px-3 py-2.5 last:border-b-0 active:bg-muted", current && "bg-brand/10")}>
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", m.is_locked ? "bg-yellow-100 text-yellow-700" : done ? "bg-green-fix-600 text-white" : current ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground")}>
          <Status className={cn("h-4 w-4", Status === Play && "ml-0.5 fill-current")} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold leading-tight">{m.title}</p>
          <div className="mt-1 flex items-center gap-2 text-muted-foreground">
            <span className="text-[11px] font-medium">{fmtMinutes(m.estimated_minutes)}</span>
            {m.has_video && <Video className="h-3.5 w-3.5" aria-label="Video" />}
            {m.has_documents && <FileText className="h-3.5 w-3.5" aria-label="Documents" />}
            {m.has_flashcards && <Layers className="h-3.5 w-3.5" aria-label="Flashcards" />}
            {m.has_quiz && <PenLine className="h-3.5 w-3.5" aria-label="Quiz" />}
          </div>
        </div>
        {m.access_status === "free" && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-800">FREE</span>}
      </Link>
    </li>
  );
}
