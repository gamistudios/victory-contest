import { useMemo, useState } from "react";
import type { EditorialItem } from "./api";

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
      <div className="flex flex-col gap-3 p-4">
        <h2 className="text-lg font-bold">Practice, not recorded</h2>
        <p className="text-sm">You got {correct} of {qs.length}. This score is not saved or ranked.</p>
        <button className="h-11 rounded-xl border" onClick={onClose}>Back to result</button>
      </div>
    );
  }
  const q = qs[i];
  const choose = (n: number) => { if (picked !== null) return; setPicked(n); if (n === q.answer) setCorrect((c) => c + 1); };
  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-xs opacity-70">Practice, not recorded · {i + 1} / {qs.length}</p>
      <p className="whitespace-pre-wrap">{q.question_text}</p>
      {q.multiple_choice.map((o, k) => (
        <button key={k} onClick={() => choose(k + 1)} disabled={picked !== null}
          className={`rounded-xl border p-3 text-left text-sm ${picked !== null && k + 1 === q.answer ? "border-green-600 bg-green-50" : picked === k + 1 ? "border-red-600 bg-red-50" : ""}`}>{o}</button>
      ))}
      {picked !== null && (
        <>
          {q.explanation && <p className="text-sm opacity-80">{q.explanation}</p>}
          <button className="h-11 rounded-xl bg-primary text-primary-foreground" onClick={() => { setPicked(null); setI(i + 1); }}>Next</button>
        </>
      )}
    </div>
  );
}
