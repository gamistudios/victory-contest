import { Bot, BookOpen, Check, ChevronLeft, ChevronRight, FileText, Layers, Lock, PenLine, Sparkles, Video } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { completeModule, getModule } from "@/services/academy/academyApi";
import type { ModuleProgress, ResourceKey } from "@/types/academy";
import { useAsync } from "../hooks/useAsync";
import { CardSkeleton, InlineError } from "../components/States";
import { AccessBadge } from "../components/AccessBadge";
import { BackButton } from "../components/PageHeader";
import { ProgressRing } from "../components/ProgressRing";
import { UpgradeSheet } from "../components/UpgradeSheet";
import { LockedPanel } from "../module/LockedPanel";
import { ReadTab } from "../module/ReadTab";
import { WatchTab } from "../module/WatchTab";
import { DocsTab } from "../module/DocsTab";
import { CardsTab } from "../module/CardsTab";
import { QuizTab } from "../module/QuizTab";
import { AiTab } from "../module/AiTab";
import { fmtMinutes, toneFor } from "../lib/theme";
import { cn } from "@/lib/utils";
import { useTelegram } from "@/hooks/useTelegram";

type TabId = "read" | "watch" | "docs" | "cards" | "quiz" | "ai";

export default function ModulePage() {
  const { id = "" } = useParams();
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const { hapticFeedback } = useTelegram();
  const { data, loading, error, reload, refresh } = useAsync(() => getModule(id), [id]);
  const [upgrade, setUpgrade] = useState<{ open: boolean; feature: string }>({ open: false, feature: "" });
  const [selection, setSelection] = useState("");
  const [prog, setProg] = useState<ModuleProgress | null>(null);
  const [readPct, setReadPct] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setProg(data?.progress ?? null); setReadPct(data?.progress?.read_percentage ?? 0); }, [data]);
  useEffect(() => { window.scrollTo(0, 0); }, [id]);

  const tabs = useMemo(() => {
    if (!data) return [];
    const t: Array<{ id: TabId; label: string; icon: typeof BookOpen; key: ResourceKey; badge?: number }> = [{ id: "read", label: "Read", icon: BookOpen, key: "reading" }];
    if (data.counts.has_video) t.push({ id: "watch", label: "Watch", icon: Video, key: "video" });
    if (data.counts.documents) t.push({ id: "docs", label: "Docs", icon: FileText, key: "documents", badge: data.counts.documents });
    t.push({ id: "cards", label: "Cards", icon: Layers, key: "flashcards", badge: data.counts.flashcards || undefined });
    t.push({ id: "quiz", label: "Quiz", icon: PenLine, key: "quiz" });
    t.push({ id: "ai", label: "Ask AI", icon: Bot, key: "ai_tutor" });
    return t;
  }, [data]);

  const tab = (sp.get("tab") as TabId) || "read";
  const setTab = useCallback((t: TabId) => { hapticFeedback("selection"); setSp({ tab: t }, { replace: true }); window.scrollTo({ top: 0 }); }, [setSp, hapticFeedback]);

  if (error) return <div className="space-y-4 p-4"><BackButton /><InlineError message={error} onRetry={reload} /></div>;
  if (loading || !data) return <div className="space-y-3 p-4"><CardSkeleton className="h-24" /><CardSkeleton className="h-12" /><CardSkeleton className="h-64" /></div>;

  const { module: m, locks, subject, chapter, prev, next, referral } = data;
  const tone = toneFor(subject.color_theme);
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];
  const done = !!prog?.completed;
  // A locked lesson cannot be completed at all, so the bottom bar's whole job is
  // the upgrade - "Mark complete" here promised an action it did not perform.
  const lessonLocked = locks.reading;
  const pct = done ? 100 : Math.round(Math.max(readPct, prog?.video_completed ? 100 : 0) * 0.9);
  const openUpgrade = (feature: string) => setUpgrade({ open: true, feature });

  const toggleComplete = async () => {
    if (lessonLocked) {
      hapticFeedback("impact", "light");
      return openUpgrade("this lesson");
    }
    try {
      const r = await completeModule(m.id, !done);
      setProg(r.progress);
      hapticFeedback("notification", "success");
      toast.success(r.progress.completed ? "Lesson completed 🎉" : "Marked as not completed");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const goto = (n: typeof prev) => {
    if (!n) return;
    if (n.is_locked && !data.referral.unlocked) hapticFeedback("notification", "warning");
    navigate(`/academy/module/${n.id}`);
  };

  const content = () => {
    switch (active.id) {
      case "read":
        return <ReadTab module={m} locked={locks.reading} fullyLocked={data.fully_locked} referral={referral} onUpgrade={() => openUpgrade("this lesson")} initialPct={readPct} onProgress={setReadPct} onAskSelection={(t) => { setSelection(t); setTab("ai"); }} />;
      case "watch":
        return locks.video ? <Locked label="Video lesson" /> : <WatchTab module={m} initialSeconds={prog?.video_time_seconds ?? 0} completed={!!prog?.video_completed} onCompleted={refresh} />;
      case "docs":
        return locks.documents ? <Locked label="Documents" /> : <DocsTab module={m} initialPage={prog?.document_current_page ?? 1} />;
      case "cards":
        return locks.flashcards ? <Locked label="Flashcards" /> : <CardsTab moduleId={m.id} deck={m.flashcard_deck} initialMastered={data.flashcard_progress?.mastered_ids ?? []} initialStruggling={data.flashcard_progress?.struggling_ids ?? []} aiLocked={locks.ai_tutor} onNeedUpgrade={() => openUpgrade("AI flashcards")} />;
      case "quiz":
        return <QuizTab moduleId={m.id} quiz={m.quiz ?? null} quizLocked={locks.quiz} aiLocked={locks.ai_tutor} onNeedUpgrade={openUpgrade} onAttempt={refresh} />;
      case "ai":
        return locks.ai_tutor ? <Locked label="AI tutor" /> : <AiTab moduleId={m.id} moduleTitle={m.title} selection={selection} onClearSelection={() => setSelection("")} />;
    }
  };

  // Each locked resource gets the same panel; the Read tab has its own premium
  // card (ReadTab) because it keeps a server-approved teaser to show.
  function Locked({ label }: { label: string }) {
    return <LockedPanel title={label} hasReferral={referral.enabled} onUnlock={() => openUpgrade(label.toLowerCase())} />;
  }

  return (
    <div className="pb-28" ref={topRef}>
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-lg pt-safe">
        <div className="flex items-center gap-2 px-3 py-2">
          <BackButton to={`/academy/subject/${subject.id}`} />
          <div className="min-w-0 flex-1">
            <p className={cn("truncate text-[11px] font-extrabold uppercase tracking-wider", tone.text)}>{subject.name} · Ch {chapter.order_number}</p>
            <h1 className="line-clamp-1 font-nunito text-base font-extrabold leading-tight">{m.title}</h1>
          </div>
          <ProgressRing value={pct} size={42} stroke={4} arcClass={tone.stroke} label="Lesson progress" />
        </div>
        <div className="flex items-center gap-2 px-4 pb-2 text-[11px] font-semibold text-muted-foreground">
          <AccessBadge access={m.access_status} locked={locks.reading} />
          <span>{fmtMinutes(m.estimated_minutes)}</span><span>·</span><span>{m.difficulty}</span>
          {done && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 font-bold text-green-800"><Check className="h-3 w-3" />Done</span>}
        </div>
        <nav aria-label="Lesson sections" className="flex gap-1 overflow-x-auto px-2 scrollbar-hide" role="tablist">
          {tabs.map((t) => {
            const Icon = t.icon;
            const on = t.id === active.id;
            return (
              <button key={t.id} role="tab" aria-selected={on} onClick={() => setTab(t.id)} className={cn("relative flex min-w-[3.5rem] flex-1 shrink-0 flex-col items-center gap-0.5 border-b-2 px-2 pb-2 pt-1.5 transition", on ? "border-brand text-foreground" : "border-transparent text-muted-foreground")}>
                <span className="relative"><Icon className="h-5 w-5" />{locks[t.key] && <Lock className="absolute -right-2 -top-1.5 h-3 w-3 rounded-full bg-card text-yellow-700" />}{t.badge ? <span className="absolute -right-3.5 -top-2 min-w-4 rounded-full bg-muted px-1 text-[9px] font-extrabold text-foreground">{t.badge}</span> : null}</span>
                <span className="text-[11px] font-bold">{t.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      <main className="p-4">{content()}</main>

      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-3xl items-center gap-2 border-t border-border bg-card/95 p-3 pb-safe backdrop-blur-lg">
        <button onClick={() => goto(prev)} disabled={!prev} aria-label="Previous lesson" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted disabled:opacity-30"><ChevronLeft className="h-5 w-5" /></button>
        <button onClick={toggleComplete} className={cn("flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-base font-bold transition active:scale-[0.98]", lessonLocked ? "bg-gradient-to-r from-yellow-fix-600 to-orange-fix-700 text-white" : done ? "bg-green-100 text-green-900" : "bg-blue-fix-600 text-white")}>
          {lessonLocked ? <Sparkles className="h-5 w-5" /> : <Check className="h-5 w-5" />}{lessonLocked ? "Upgrade to Unlock" : done ? "Completed" : "Mark complete"}
        </button>
        <button onClick={() => goto(next)} disabled={!next} aria-label="Next lesson" className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted disabled:opacity-30"><ChevronRight className="h-5 w-5" />{next?.is_locked && <Lock className="absolute right-1 top-1 h-3 w-3 text-yellow-700" />}</button>
      </div>

      <UpgradeSheet open={upgrade.open} onOpenChange={(o) => setUpgrade((u) => ({ ...u, open: o }))} moduleId={m.id} feature={upgrade.feature} referral={referral} onUnlocked={reload} />
    </div>
  );
}
