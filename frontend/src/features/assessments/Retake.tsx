import { useMemo, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditorialItem } from "./api";
import ZoomImage from "./ZoomImage";

const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

/**
 * "Practice again (not recorded)": runs the editorial payload locally, shuffled,
 * graded on the device. It never calls the API (plan §5.4.3).
 */
export default function Retake({ items, onClose }: { items: EditorialItem[]; onClose: () => void }) {
  const qs = useMemo(() => shuffle(items), [items]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const done = i >= qs.length;

  if (done) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-3 p-4 pb-24">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Practice, not recorded</p>
          <p className="mt-1 font-nunito text-2xl font-extrabold text-foreground">{correct} / {qs.length}</p>
          <p className="mt-1 text-sm text-muted-foreground">This score is never saved or ranked.</p>
        </div>
        <button className="h-12 rounded-xl bg-primary text-sm font-bold text-primary-foreground" onClick={onClose}>Back to result</button>
      </div>
    );
  }
  const q = qs[i];
  const choose = (n: number) => { if (picked !== null) return; setPicked(n); if (n === q.answer) setCorrect((c) => c + 1); };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 p-4 pb-24">
      <div className="flex items-center justify-between">
        <p className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Practice, not recorded</p>
        <p className="text-sm font-bold text-foreground">{i + 1} <span className="font-normal text-muted-foreground">/ {qs.length}</span></p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="whitespace-pre-wrap text-base text-foreground">{q.question_text}</p>
        <ZoomImage src={q.question_image} alt={`Illustration for question ${i + 1}`} />
      </div>

      <div className="flex flex-col gap-2" role="radiogroup" aria-label={`Options for question ${i + 1}`}>
        {q.multiple_choice.map((o, k) => (
          <button key={k} role="radio" aria-checked={picked === k + 1} onClick={() => choose(k + 1)} disabled={picked !== null}
            className={cn("flex items-start gap-2 rounded-xl border p-3 text-left text-sm transition",
              picked !== null && k + 1 === q.answer ? "border-green-600 bg-green-50 font-semibold text-green-900"
                : picked === k + 1 ? "border-red-500 bg-red-50 text-red-900" : "border-border bg-card text-foreground")}>
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
              {String.fromCharCode(65 + k)}
            </span>
            <span className="min-w-0 flex-1">
              {o}
              {/* Plain img: the option is a button, so a zoom button cannot nest inside it. */}
              {q.option_images?.[k] && <img src={q.option_images[k]} alt={`Option ${String.fromCharCode(65 + k)}`}
                onError={(e) => { e.currentTarget.style.display = "none"; }}
                className="mt-2 max-h-32 w-auto rounded-lg border border-border object-contain" />}
            </span>
            {picked !== null && k + 1 === q.answer && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden />}
            {picked === k + 1 && k + 1 !== q.answer && <XCircle className="h-4 w-4 shrink-0 text-red-500" aria-hidden />}
          </button>
        ))}
      </div>

      {picked !== null && (
        <>
          {q.explanation && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Explanation</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">{q.explanation}</p>
              <ZoomImage src={q.explanation_image} alt={`Explanation image for question ${i + 1}`} />
            </div>
          )}
          <button className="h-12 rounded-xl bg-primary text-sm font-bold text-primary-foreground"
            onClick={() => { setPicked(null); setI(i + 1); }}>{i + 1 === qs.length ? "See the score" : "Next question"}</button>
        </>
      )}
    </div>
  );
}
