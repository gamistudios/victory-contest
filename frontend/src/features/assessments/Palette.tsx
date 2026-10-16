import type { PublicQuestion } from "./api";

/** Question palette: answered / flagged / current at a glance. */
export default function Palette({ questions, answers, flagged, current, onPick }: {
  questions: PublicQuestion[]; answers: Record<string, number>; flagged: string[]; current: number; onPick: (i: number) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-2" role="navigation" aria-label="Question palette">
      {questions.map((q, i) => {
        const done = answers[q.id] > 0, flag = flagged.includes(q.id);
        const cls = i === current ? "ring-2 ring-ring" : "";
        const bg = flag ? "bg-amber-200" : done ? "bg-green-200" : "bg-muted";
        return (
          <button key={q.id} onClick={() => onPick(i)} className={`h-10 rounded-lg text-sm font-medium ${bg} ${cls}`}
            aria-label={`Question ${i + 1}${done ? ", answered" : ""}${flag ? ", flagged" : ""}`}>{i + 1}</button>
        );
      })}
    </div>
  );
}
