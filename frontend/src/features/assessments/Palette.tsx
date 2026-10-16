import { cn } from "@/lib/utils";
import type { PublicQuestion } from "./api";

const LEGEND = [
  { label: "Answered", cls: "bg-green-200" },
  { label: "Flagged", cls: "bg-amber-200" },
  { label: "Skipped", cls: "bg-muted" },
];

/** Question palette: answered / flagged / current at a glance. */
export default function Palette({ questions, answers, flagged, current, onPick }: {
  questions: PublicQuestion[]; answers: Record<string, number>; flagged: string[]; current: number; onPick: (i: number) => void;
}) {
  return (
    <nav className="rounded-2xl border border-border bg-card p-3" aria-label="Question palette">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-foreground">Questions</p>
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {LEGEND.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1">
              <span className={cn("h-2.5 w-2.5 rounded-full", l.cls)} aria-hidden />{l.label}
            </span>
          ))}
        </p>
      </div>
      <div className="grid grid-cols-6 gap-2">
        {questions.map((q, i) => {
          const done = answers[q.id] > 0, flag = flagged.includes(q.id);
          return (
            <button key={q.id} onClick={() => onPick(i)}
              aria-label={`Question ${i + 1}${done ? ", answered" : ", not answered"}${flag ? ", flagged" : ""}`}
              aria-current={i === current ? "true" : undefined}
              className={cn("h-10 rounded-lg text-sm font-bold transition active:scale-95",
                flag ? "bg-amber-200 text-amber-900" : done ? "bg-green-200 text-green-900" : "bg-muted text-muted-foreground",
                i === current && "ring-2 ring-blue-600 ring-offset-1")}>
              {i + 1}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
