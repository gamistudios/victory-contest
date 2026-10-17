// Private streak panel: current/best streak, completion % and the 30-day calendar (plan §5.10, decisions 16/22).
// Shown only to the student themself. No ranking, no points, nothing comparative.
import { Award, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HabitBadge, HabitToday } from "./api";

const cell: Record<string, string> = {
  complete: "bg-emerald-500 text-white",
  partial: "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100",
  missed: "bg-muted text-muted-foreground line-through decoration-1",
  upcoming: "border border-dashed border-border text-muted-foreground",
};

export function StreakStats({ current, best, pct }: { current: number; best: number; pct: number }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div className="rounded-2xl border border-border bg-card p-3">
        <Flame className={cn("mx-auto h-5 w-5", current > 0 ? "text-orange-500" : "text-muted-foreground")} aria-hidden />
        <div className="text-2xl font-extrabold text-foreground">{current}</div>
        <div className="text-[11px] font-semibold text-muted-foreground">Current streak</div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-3">
        <Award className="mx-auto h-5 w-5 text-amber-500" aria-hidden />
        <div className="text-2xl font-extrabold text-foreground">{best}</div>
        <div className="text-[11px] font-semibold text-muted-foreground">Best streak</div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="text-2xl font-extrabold leading-8 text-foreground">{pct}%</div>
        <div className="text-[11px] font-semibold text-muted-foreground">Completed</div>
      </div>
    </div>
  );
}

export function Calendar30({ days }: { days: HabitToday["calendar"] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Your 30 days</p>
      <ol className="grid grid-cols-6 gap-1.5 sm:grid-cols-10" aria-label="30-day calendar">
        {days.map((d) => (
          <li
            key={d.day}
            title={`Day ${d.day}: ${d.done}/${d.total}`}
            aria-label={`Day ${d.day}, ${d.state}${d.is_today ? ", today" : ""}`}
            className={cn("flex aspect-square items-center justify-center rounded-lg text-xs font-bold", cell[d.state], d.is_today && "ring-2 ring-primary ring-offset-1 ring-offset-background")}
          >
            {d.day}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function BadgeRow({ badges }: { badges: HabitBadge[] }) {
  if (!badges.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((b) => (
        <span key={b.id} title={b.description} className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
          <Award className="h-3.5 w-3.5" aria-hidden /> {b.name}
        </span>
      ))}
    </div>
  );
}

export default function Streak({ data, badges = [] }: { data: HabitToday; badges?: HabitBadge[] }) {
  return (
    <div className="space-y-4">
      <StreakStats current={data.current_streak} best={data.best_streak} pct={data.completion_pct} />
      <BadgeRow badges={badges} />
      <Calendar30 days={data.calendar} />
    </div>
  );
}
