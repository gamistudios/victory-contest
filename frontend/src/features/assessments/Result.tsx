import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Trophy, XCircle } from "lucide-react";
import { useServerClock } from "@/shared/data/useServerClock";
import { CardSkeleton, InlineError } from "@/academy/components/States";
import { cn } from "@/lib/utils";
import { enc, getResult, type ResultView } from "./api";
import { formatCountdown } from "./Timer";
import Retake from "./Retake";
import ZoomImage from "./ZoomImage";

/** Result: score/points breakdown now; answers unlock automatically at reveal time. */
export default function Result() {
  const { id = "" } = useParams();
  const clock = useServerClock();
  const [r, setR] = useState<ResultView | null>(null);
  const [err, setErr] = useState("");
  const [practice, setPractice] = useState(false);
  const [, tick] = useState(0);

  const load = useCallback(() => getResult(id).then((v) => { clock.sync(v.server_now); setR(v); })
    .catch(() => setErr("Could not load the result.")), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);

  const revealMs = r && !r.answers_visible && r.reveal_at ? Date.parse(r.reveal_at) - clock.now() : 0;
  useEffect(() => {
    if (!r || r.answers_visible || !r.reveal_at) return;
    const t = setInterval(() => {
      tick((n) => n + 1);
      if (Date.parse(r.reveal_at!) - clock.now() <= 0) { clearInterval(t); void load(); } // flips on its own
    }, 1000);
    return () => clearInterval(t);
  }, [r?.answers_visible, r?.reveal_at]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div className="mx-auto max-w-xl p-4"><InlineError message={err} onRetry={load} /></div>;
  if (!r) return <div className="mx-auto max-w-xl space-y-3 p-4"><CardSkeleton /><CardSkeleton /></div>;
  const a = r.attempt;
  const pct = a.total ? Math.round((100 * a.correct) / a.total) : 0;
  if (practice && r.editorial) return <Retake items={r.editorial} onClose={() => setPractice(false)} />;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 p-4 pb-24">
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your first attempt</p>
        <p className="mt-1 font-nunito text-2xl font-extrabold text-foreground">{a.correct} / {a.total} correct</p>
        <p className="mt-1 text-sm text-foreground">
          {pct}%{a.is_late && a.penalty_percent > 0 ? ` − ${a.penalty_percent}% late penalty` : ""} = <b>{a.points} points</b>
          {a.is_late && a.penalty_waived ? " (late penalty waived)" : ""}
        </p>
        {a.status === "auto_submitted" && <p className="mt-1 text-xs text-muted-foreground">Your time ran out and your saved answers were submitted.</p>}
        {a.status === "abandoned" && <p className="mt-1 text-xs text-muted-foreground">Time ran out before any answers were saved.</p>}
      </div>

      {!r.answers_visible && revealMs > 0 && (
        <p className="flex items-center gap-2 rounded-2xl border border-border bg-muted p-3 text-sm text-foreground">
          <Trophy className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />Answers unlock in {formatCountdown(revealMs)}.
        </p>
      )}

      <button className="h-12 rounded-xl border border-border text-sm font-bold text-foreground disabled:opacity-50"
        disabled={!r.answers_visible} onClick={() => setPractice(true)}>
        {r.answers_visible ? "Practice again (not recorded)" : "Practice unlocks when answers are revealed"}
      </button>

      {r.answers_visible && r.editorial?.map((q, i) => (
        <div key={q.id} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start gap-2">
            {q.is_correct
              ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden />
              : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" aria-hidden />}
            <p className="whitespace-pre-wrap text-sm font-medium text-foreground">{i + 1}. {q.question_text}</p>
          </div>
          <ZoomImage src={q.question_image} alt={`Illustration for question ${i + 1}`} />
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {q.multiple_choice.map((opt, oi) => (
              <li key={oi} className={cn("flex gap-2 rounded-lg px-2 py-1",
                oi + 1 === q.answer ? "bg-green-50 font-semibold text-green-900"
                  : oi + 1 === q.user_answer && !q.is_correct ? "bg-red-50 text-red-900" : "text-foreground")}>
                <span className="shrink-0 font-bold text-muted-foreground">{String.fromCharCode(65 + oi)}.</span>
                <span className="min-w-0 flex-1">
                  {opt}
                  {q.option_images?.[oi] && (
                    <img src={q.option_images[oi]} alt={`Option ${String.fromCharCode(65 + oi)}`}
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                      className="mt-2 max-h-32 w-auto rounded-lg border border-border object-contain" />
                  )}
                </span>
                {oi + 1 === q.user_answer && <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">your answer</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            {q.is_correct ? "Correct." : q.user_answer > 0 ? `You chose ${String.fromCharCode(64 + q.user_answer)}; the answer is ${String.fromCharCode(64 + q.answer)}.` : `Not answered; the answer is ${String.fromCharCode(64 + q.answer)}.`}
          </p>
          {q.explanation && (
            <p className="mt-2 whitespace-pre-wrap border-t border-border pt-2 text-sm text-foreground/90">{q.explanation}</p>
          )}
          <ZoomImage src={q.explanation_image} alt={`Explanation image for question ${i + 1}`} />
        </div>
      ))}

      <Link className="text-center text-sm underline text-muted-foreground" to={`/assessment/${enc(a.contest_id)}/leaderboard`}>See the leaderboard</Link>
    </div>
  );
}
