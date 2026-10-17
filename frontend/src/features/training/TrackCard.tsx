// One track row (any length): title, own progress (day, streak, % complete) and a Start / Continue / Unlock button.
// Progress is the student's own (from /habits/me); nothing here compares students.
import { Flame, Lock, PlayCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HabitPlanView, HabitTrack } from "./api";

export default function TrackCard({ plan, progress, busy, onOpen }: {
  plan: HabitPlanView; progress?: HabitTrack; busy?: boolean; onOpen: (p: HabitPlanView) => void;
}) {
  const started = plan.started || !!progress;
  const finished = !!progress?.finished;
  const pct = progress?.completion_pct ?? 0;
  const streak = progress?.current_streak ?? plan.current_streak;
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", plan.lock ? "bg-yellow-100 text-yellow-700" : finished ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700")}>
          {plan.lock ? <Lock className="h-6 w-6" aria-hidden /> : finished ? <CheckCircle2 className="h-6 w-6" aria-hidden /> : <PlayCircle className="h-6 w-6" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-bold text-foreground">{plan.title}</p>
            {plan.access === "premium" && <span className="shrink-0 rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-semibold text-yellow-800">Premium</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            {started && progress
              ? finished ? "Finished" : `Day ${progress.day_number} of ${progress.days_count || plan.days_count || 30}`
              : `${plan.days_count || 30} days`}
            {started && streak > 0 ? <span className="ml-2 inline-flex items-center gap-0.5 font-semibold text-orange-600"><Flame className="h-3 w-3" aria-hidden />{streak}-day streak</span> : null}
          </p>
        </div>
        <Button className="h-11 shrink-0 rounded-xl" variant={plan.lock ? "outline" : "default"} disabled={busy} onClick={() => onOpen(plan)}>
          {plan.lock ? "Unlock" : finished ? "Review" : started ? "Continue" : "Start"}
        </Button>
      </div>
      {started && !plan.lock && (
        <div className="mt-3" aria-label={`${pct}% completed`}>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, pct)}%` }} /></div>
          <p className="mt-1 text-right text-[11px] font-semibold text-muted-foreground">{pct}% completed{progress ? ` · best streak ${progress.best_streak}` : ""}</p>
        </div>
      )}
    </div>
  );
}
