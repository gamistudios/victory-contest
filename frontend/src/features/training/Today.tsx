// Training: pick a private track (any length the admin chose), tick today's checklist, watch your own streak (plan §5.10).
// Premium tracks the student cannot open show the app's standard locked treatment. No ranking anywhere.
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, ChevronLeft, Circle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { errData } from "@/services/api";
import { usePremiumSheet } from "@/context/PremiumSheetContext";
import { CardSkeleton, EmptyState, InlineError } from "@/shared/ui/States";
import Streak from "./Streak";
import TrackCard from "./TrackCard";
import { checkHabit, getHabitMe, getHabitToday, startHabit, useTrainingOverview, type HabitBadge, type HabitPlanView, type HabitToday } from "./api";

const lockedCode = (e: unknown) => (e as { response?: { status?: number } })?.response?.status === 402;

function Checklist({ planId, initial, onBack }: { planId: string; initial: HabitToday; onBack: () => void }) {
  const [data, setData] = useState(initial);
  const [badges, setBadges] = useState<HabitBadge[]>([]);
  const [busy, setBusy] = useState("");

  useEffect(() => { void getHabitMe().then((m) => setBadges(m.badges)).catch(() => {}); }, []);

  const toggle = async (itemId: string) => {
    if (busy) return;
    setBusy(itemId);
    const prev = data;
    setData({ ...data, items: data.items.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)) }); // optimistic
    try {
      const next = await checkHabit(planId, itemId);
      setData(next);
      if (next.badges_earned?.length) {
        setBadges((b) => [...next.badges_earned!, ...b]);
        toast.success(`New badge: ${next.badges_earned[0].name} 🔥`);
      }
    } catch (e) {
      setData(prev);
      toast.error(errData(e).error || "Could not save that. Try again.");
    } finally { setBusy(""); }
  };

  const done = data.items.filter((i) => i.done).length;
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700"><ChevronLeft className="h-4 w-4" aria-hidden /> Tracks</button>
      <div>
        <h1 className="text-xl font-extrabold text-foreground">{data.title}</h1>
        <p className="text-sm text-muted-foreground">
          {data.finished ? `You finished this ${data.days_count || 30}-day track.` : `Day ${data.day_number} of ${data.days_count || 30}${data.day_title ? ` · ${data.day_title}` : ""}`}
        </p>
      </div>

      {!data.finished && (
        <section aria-label="Today's checklist" className="space-y-2">
          {data.items.length === 0 && <EmptyState title="Nothing planned for today" hint="Enjoy the rest day." />}
          {data.items.map((it) => (
            <button
              key={it.id} role="checkbox" aria-checked={it.done} onClick={() => toggle(it.id)} disabled={busy === it.id}
              className={cn("flex min-h-[52px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition active:scale-[0.99]",
                it.done ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30" : "border-border bg-card")}
            >
              {it.done ? <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" aria-hidden /> : <Circle className="h-6 w-6 shrink-0 text-muted-foreground" aria-hidden />}
              <span className={cn("text-sm font-semibold", it.done && "text-muted-foreground line-through")}>{it.label}</span>
            </button>
          ))}
          {data.items.length > 0 && <p className="text-right text-xs font-semibold text-muted-foreground">{done}/{data.items.length} done today</p>}
        </section>
      )}
      <Streak data={data} badges={badges} />
      <p className="text-center text-xs text-muted-foreground">Only you and your coaches can see this. There is no ranking.</p>
    </div>
  );
}

export default function TodayPage() {
  const t = useTrainingOverview();
  const premium = usePremiumSheet();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<{ id: string; view: HabitToday } | null>(null);
  const [starting, setStarting] = useState("");

  const openPlan = async (p: HabitPlanView) => {
    if (p.lock) { premium.open("plan", p.lock.program_id || p.program_id); return; }
    setStarting(p.id);
    try {
      const view = p.started ? await getHabitToday(p.id) : await startHabit(p.id);
      setOpen({ id: p.id, view });
    } catch (e) {
      if (lockedCode(e)) premium.open("plan", p.program_id);
      else toast.error(errData(e).error || "Could not open this track.");
    } finally { setStarting(""); }
  };

  // Deep link from the Home / Practice cards: /training?plan=<id> opens (and starts, if new) that track once.
  const deepLinked = useRef(false);
  useEffect(() => {
    const id = params.get("plan");
    if (!id || deepLinked.current || t.loading) return;
    deepLinked.current = true;
    setParams({}, { replace: true });
    const p = t.plans.find((x) => x.id === id);
    if (p) void openPlan(p);
    else toast.error("That track is not available to you.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, t.loading, t.plans]);

  if (open) return <div className="mx-auto w-full max-w-xl p-4"><Checklist planId={open.id} initial={open.view} onBack={() => { setOpen(null); t.reload(); }} /></div>;

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 p-4 pb-28">
      <div>
        <h1 className="text-xl font-extrabold text-foreground">Training</h1>
        <p className="text-sm text-muted-foreground">Small steps every day. Start a track and keep your streak. Only you and your coaches see your progress.</p>
      </div>
      {t.error && <InlineError message="Could not load your tracks." onRetry={t.reload} />}
      {t.loading && !t.error && <><CardSkeleton /><CardSkeleton /></>}
      {!t.loading && !t.error && t.plans.length === 0 && (
        <EmptyState
          title={t.enabled ? "No tracks yet" : "Training is not part of your programs"}
          hint={t.enabled ? "New tracks will appear here as soon as they are published." : "Enrol in the Training program to get started."}
          action={!t.enabled ? <Link to="/programs" className="text-sm font-semibold text-blue-600">Go to My programs</Link> : undefined}
        />
      )}
      {t.plans.map((p) => <TrackCard key={p.id} plan={p} progress={t.progressOf(p.id)} busy={starting === p.id} onOpen={openPlan} />)}
    </div>
  );
}
