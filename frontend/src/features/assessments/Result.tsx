import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useServerClock } from "@/shared/data/useServerClock";
import { getResult, type ResultView } from "./api";
import { formatCountdown } from "./Timer";
import Retake from "./Retake";

/** Result: score/points breakdown now; answers unlock automatically at reveal time. */
export default function Result() {
  const { id = "" } = useParams();
  const clock = useServerClock();
  const [r, setR] = useState<ResultView | null>(null);
  const [err, setErr] = useState("");
  const [practice, setPractice] = useState(false);
  const [, tick] = useState(0);

  const load = () => getResult(id).then((v) => { clock.sync(v.server_now); setR(v); })
    .catch(() => setErr("Could not load the result."));
  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const revealMs = r && !r.answers_visible && r.reveal_at ? Date.parse(r.reveal_at) - clock.now() : 0;
  useEffect(() => {
    if (!r || r.answers_visible || !r.reveal_at) return;
    const t = setInterval(() => {
      tick((n) => n + 1);
      if (Date.parse(r.reveal_at!) - clock.now() <= 0) { clearInterval(t); void load(); } // flips on its own
    }, 1000);
    return () => clearInterval(t);
  }, [r?.answers_visible, r?.reveal_at]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div className="p-4 text-sm text-red-600">{err}</div>;
  if (!r) return <div className="p-4 text-sm">Loading…</div>;
  const a = r.attempt;
  const pct = a.total ? Math.round((100 * a.correct) / a.total) : 0;
  if (practice && r.editorial) return <Retake items={r.editorial} onClose={() => setPractice(false)} />;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">{a.correct} / {a.total} correct</h1>
      <p className="text-sm">
        {pct}%{a.is_late && a.penalty_percent > 0 ? ` − ${a.penalty_percent}% late penalty` : ""} = <b>{a.points} points</b>
        {a.is_late && a.penalty_waived ? " (late penalty waived)" : ""}
      </p>
      {a.status === "auto_submitted" && <p className="text-xs opacity-70">Your time ran out and your saved answers were submitted.</p>}
      {a.status === "abandoned" && <p className="text-xs opacity-70">Time ran out before any answers were saved.</p>}
      {!r.answers_visible && revealMs > 0 && <p className="rounded-xl bg-muted p-3 text-sm">Answers unlock in {formatCountdown(revealMs)}.</p>}
      <button className="h-11 rounded-xl border text-sm disabled:opacity-50" disabled={!r.answers_visible} onClick={() => setPractice(true)}>
        {r.answers_visible ? "Practice again (not recorded)" : "Practice unlocks when answers are revealed"}
      </button>
      {r.answers_visible && r.editorial?.map((q, i) => (
        <div key={q.id} className="rounded-2xl border p-3 text-sm">
          <p className="font-medium">{i + 1}. {q.question_text}</p>
          <p className="mt-2">Your answer (first attempt): {q.user_answer > 0 ? q.multiple_choice[q.user_answer - 1] : "—"} {q.is_correct ? "✓" : "✗"}</p>
          {!q.is_correct && <p>Correct answer: {q.multiple_choice[q.answer - 1]}</p>}
          {q.explanation && <p className="mt-1 opacity-80">{q.explanation}</p>}
        </div>
      ))}
    </div>
  );
}
