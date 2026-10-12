import { Bot, ChevronDown, Flame, Info, Layers, Lock, Play, PenLine, Sparkles, Target, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getDashboard, getPrograms, updateMe } from "@/services/academy/academyApi";
import type { LevelId, StreamId } from "@/types/academy";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useAsync } from "../hooks/useAsync";
import { useAcademy } from "../context/AcademyContext";
import { HomeSkeleton, InlineError } from "../components/States";
import { ProgressRing } from "../components/ProgressRing";
import { SectionTitle } from "../components/PageHeader";
import { SubjectTile } from "../components/SubjectTile";
import { LEVEL_SHORT, STREAM_SHORT, iconFor, toneFor, fmtMinutes } from "../lib/theme";
import { cn } from "@/lib/utils";
import { useTelegram } from "@/hooks/useTelegram";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

export default function Home() {
  const { data, loading, error, reload } = useAsync(getDashboard, []);
  const { isPremium, refreshStudent } = useAcademy();
  const navigate = useNavigate();
  const { hapticFeedback } = useTelegram();
  const [pick, setPick] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (loading && !data) return <HomeSkeleton />;
  if (error || !data) return <div className="p-4"><InlineError message={error} onRetry={reload} /></div>;

  const d = data;
  const cont = d.continue_module;
  const ContIcon = cont ? iconFor(d.subjects.find((s) => s.id === cont.subject_id)?.icon_name) : Play;
  const tone = toneFor(cont?.subject_color);
  const todayIdx = (new Date().getDay() + 6) % 7;
  const gap = Math.max(0, d.target.target_score - d.target.current_average);

  return (
    <div className="space-y-5 p-4">
      {d.notice && !dismissed && (
        <div role="status" className="flex items-center gap-2 rounded-xl bg-info/10 px-3 py-2 text-sm text-foreground">
          <Info className="h-4 w-4 shrink-0 text-info" />
          <p className="min-w-0 flex-1 truncate font-medium">{d.notice.text}</p>
          <button aria-label="Dismiss notice" className="tight p-1 text-muted-foreground" onClick={() => setDismissed(true)}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Continue learning hero */}
      {cont ? (
        <button
          onClick={() => { hapticFeedback("impact", "light"); navigate(`/academy/module/${cont.id}`); }}
          className={cn("relative w-full overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-left text-white shadow-lg active:scale-[0.99]", tone.grad)}
        >
          <ContIcon className="absolute -right-4 -top-4 h-32 w-32 text-white/15" aria-hidden />
          <p className="text-xs font-bold uppercase tracking-wider text-white/80">Continue · {cont.subject_name}</p>
          <h2 className="mt-1 line-clamp-2 pr-16 font-nunito text-xl font-extrabold leading-tight">{cont.title}</h2>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-white" style={{ width: `${cont.progress}%` }} /></div>
            <span className="text-xs font-bold">{cont.progress}%</span>
          </div>
          <span className="absolute bottom-4 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-white text-gray-fix-900 shadow-md"><Play className="ml-0.5 h-6 w-6 fill-current" /></span>
        </button>
      ) : (
        <div className="rounded-3xl bg-card p-5 text-center text-sm font-semibold text-muted-foreground">All caught up — pick a subject below.</div>
      )}

      {/* Streak + target */}
      <div className="grid grid-cols-5 gap-3">
        <div className="col-span-3 rounded-2xl border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-extrabold"><Flame className="h-5 w-5 fill-orange-300 text-orange-fix-600" />{d.streak_days}-day streak</span>
          </div>
          <div className="mt-2 flex justify-between">
            {DAYS.map((l, i) => (
              <span key={i} className={cn("flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold", d.week_activity[i] ? "bg-orange-fix-600 text-white" : i === todayIdx ? "border-2 border-dashed border-orange-fix-600 text-muted-foreground" : "bg-muted text-muted-foreground")}>{l}</span>
            ))}
          </div>
        </div>
        <Link to="/academy/progress" className="col-span-2 flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-3 text-center">
          <ProgressRing value={d.target.target_score ? (d.target.current_average / d.target.target_score) * 100 : 0} size={52} arcClass="stroke-green-fix-600">
            <Target className="h-5 w-5 text-green-700" />
          </ProgressRing>
          <span className="mt-1 text-[11px] font-bold">{d.target.current_average}/{d.target.target_score}</span>
          <span className="text-[10px] text-muted-foreground">{gap > 0 ? `${gap} pts to go` : "Target hit!"}</span>
        </Link>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { to: "/academy/review", icon: Layers, label: "Cards", badge: d.flashcards_due, tone: "bg-violet-100 text-violet-700" },
          { to: cont ? `/academy/module/${cont.id}?tab=quiz` : "/academy/courses", icon: PenLine, label: "Quiz", tone: "bg-blue-100 text-blue-700" },
          { to: cont ? `/academy/module/${cont.id}?tab=ai` : "/academy/courses", icon: Bot, label: "Ask AI", tone: "bg-emerald-100 text-emerald-700" },
          { to: "/academy/progress", icon: Target, label: "Goals", tone: "bg-amber-100 text-amber-700" },
        ].map(({ to, icon: Icon, label, badge, tone: t }) => (
          <Link key={label} to={to} className="relative flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card py-3 transition active:scale-95">
            <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", t)}><Icon className="h-5 w-5" /></span>
            <span className="text-[11px] font-bold">{label}</span>
            {!!badge && <span className="absolute right-2 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-fix-500 px-1 text-[10px] font-bold text-white">{badge > 99 ? "99+" : badge}</span>}
          </Link>
        ))}
      </div>

      {!isPremium && (
        <Link to="/academy/upgrade" className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-yellow-fix-600 to-orange-fix-700 p-3 text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20"><Sparkles className="h-5 w-5" /></span>
          <span className="flex-1 text-sm font-bold">Unlock every lesson, video & AI tool</span>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-gray-fix-900">Upgrade</span>
        </Link>
      )}

      {/* Subjects */}
      <section>
        <SectionTitle action={
          <button onClick={() => setPick(true)} className="inline-flex h-9 items-center gap-1 rounded-full bg-muted px-3 text-xs font-bold">
            {LEVEL_SHORT[d.student.level_id]} · {STREAM_SHORT[d.student.stream_id]} <ChevronDown className="h-3.5 w-3.5" />
          </button>
        }>My subjects</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          {d.subjects.map((s) => <SubjectTile key={s.id} subject={s} />)}
        </div>
      </section>

      {d.recommended_module && (
        <section>
          <SectionTitle>Recommended</SectionTitle>
          <Link to={`/academy/module/${d.recommended_module.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 active:scale-[0.99]">
            <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", toneFor(d.recommended_module.subject_color).soft)}><Sparkles className="h-6 w-6" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{d.recommended_module.title}</p>
              <p className="truncate text-xs text-muted-foreground">{d.recommended_module.reason} · {fmtMinutes(d.recommended_module.estimated_minutes)}</p>
            </div>
            {d.recommended_module.is_locked && <Lock className="h-4 w-4 text-yellow-700" />}
          </Link>
        </section>
      )}

      {d.weak_areas.length > 0 && (
        <section>
          <SectionTitle>Needs practice</SectionTitle>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide">
            {d.weak_areas.map((w) => (
              <Link key={w.topic} to={w.module_id ? `/academy/module/${w.module_id}?tab=quiz` : "/academy/courses"} className="flex shrink-0 items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-900">
                <span className="h-2 w-2 rounded-full bg-red-fix-500" />{w.topic}
              </Link>
            ))}
          </div>
        </section>
      )}

      <ProgramSheet open={pick} onOpenChange={setPick} level={d.student.level_id} stream={d.student.stream_id} onSaved={async () => { await refreshStudent(); reload(); }} />
    </div>
  );
}

function ProgramSheet({ open, onOpenChange, level, stream, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; level: LevelId; stream: StreamId; onSaved: () => void }) {
  const { data } = useAsync(getPrograms, []);
  const [l, setL] = useState(level);
  const [s, setS] = useState(stream);
  const prog = data?.programs.find((p) => p.id === l);
  const streams = (prog?.available_streams ?? []).filter((x) => x !== "common");
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[88dvh]">
        <DrawerHeader><DrawerTitle className="font-nunito text-xl">Choose your track</DrawerTitle><DrawerDescription>Grade or program, then stream.</DrawerDescription></DrawerHeader>
        <div className="space-y-4 overflow-y-auto px-4 pb-6 pb-safe">
          <div className="grid grid-cols-3 gap-2">
            {(data?.programs ?? []).filter((p) => p.is_active).map((p) => (
              <button key={p.id} onClick={() => { setL(p.id); setS(p.available_streams.includes("common") ? "common" : p.available_streams.includes(s) ? s : p.available_streams[0]); }}
                className={cn("flex h-14 items-center justify-center rounded-xl border text-sm font-bold", l === p.id ? "border-brand bg-brand/15 text-brand-ink" : "border-border bg-card")}>
                {LEVEL_SHORT[p.id]}
              </button>
            ))}
          </div>
          {streams.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {streams.map((x) => (
                <button key={x} onClick={() => setS(x)} className={cn("flex h-12 items-center justify-center rounded-xl border text-sm font-bold", s === x ? "border-brand bg-brand/15 text-brand-ink" : "border-border bg-card")}>
                  {STREAM_SHORT[x]} Science
                </button>
              ))}
            </div>
          )}
          <Button className="h-12 w-full bg-blue-fix-600 text-base font-bold text-white" onClick={async () => { await updateMe({ level_id: l, stream_id: s }); onOpenChange(false); onSaved(); }}>Save</Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
