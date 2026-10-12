import { Lock } from "lucide-react";
import { Link } from "react-router-dom";
import type { SubjectWithProgress } from "@/types/academy";
import { cn } from "@/lib/utils";
import { iconFor, toneFor } from "../lib/theme";
import { ProgressRing } from "./ProgressRing";

/** Visual subject card: coloured icon + ring + x/y. No paragraph text. */
export function SubjectTile({ subject: s, className }: { subject: SubjectWithProgress; className?: string }) {
  const Icon = iconFor(s.icon_name);
  const tone = toneFor(s.color_theme);
  return (
    <Link to={`/academy/subject/${s.id}`} className={cn("relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 transition active:scale-[0.98]", className)}>
      <div className="flex items-start justify-between">
        <span className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", tone.soft)}><Icon className="h-6 w-6" /></span>
        <ProgressRing value={s.progress_percentage} size={40} stroke={4} arcClass={tone.stroke} label={`${s.name} progress`} />
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-tight text-foreground">{s.name}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          {s.completed_modules}/{s.total_modules_count} lessons
          {s.locked_modules > 0 && <span className="ml-auto inline-flex items-center gap-0.5 text-yellow-700"><Lock className="h-3 w-3" />{s.locked_modules}</span>}
        </p>
      </div>
    </Link>
  );
}
