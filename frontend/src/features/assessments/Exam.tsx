import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, Flag, Loader2, AlertTriangle } from "lucide-react";
import { useServerClock } from "@/shared/data/useServerClock";
import { errCode, errData } from "@/services/api";
import { InlineError } from "@/academy/components/States";
import ScreenshotProtection from "@/components/ScreenProtection";
import { cn } from "@/lib/utils";
import { autosave, enc, startAssessment, submitAttempt, type Attempt, type PublicQuestion } from "./api";
import Palette from "./Palette";
import Timer from "./Timer";
import ZoomImage from "./ZoomImage";

type SaveState = "idle" | "saving" | "saved" | "error";

/** Exam: server-clock timer, palette, flagging, debounced autosave, resume. Route /assessment/:id/exam */
export default function Exam() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const clock = useServerClock();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [flagged, setFlagged] = useState<string[]>([]);
  const [cur, setCur] = useState(0);
  const [err, setErr] = useState("");
  const [startErr, setStartErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const version = useRef(0);
  const dirty = useRef(false);
  const finished = useRef(false);

  const boot = useCallback(() => {
    setStartErr("");
    return startAssessment(id).then((r) => {
      clock.sync(r.server_now);
      setAttempt(r.attempt); setQuestions(r.questions);
      setAnswers(r.attempt.answers ?? {});
      setFlagged(r.attempt.flagged ?? []);
      version.current = r.attempt.answers_version;
    }).catch((e) => {
      const d = errData(e);
      if (d.code === "already_attempted" && d.attempt_id) nav(`/attempt/${enc(d.attempt_id)}/result`, { replace: true });
      else if (d.code === "locked") nav(`/assessment/${enc(id)}`, { replace: true }); // the intro explains the lock
      else setStartErr(d.error || "Could not start the assessment.");
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void boot(); }, [boot]);

  const save = useCallback(async () => {
    if (!attempt || !dirty.current || finished.current) return;
    dirty.current = false;
    setSaveState("saving");
    try {
      const r = await autosave(attempt.id, answers, flagged, version.current);
      version.current = r.version; clock.sync(r.server_now);
      setSaveState("saved");
    } catch (e) {
      const code = errCode(e);
      // An attempt the server already owns (410 past the deadline, 409 recorded)
      // must stop the retry loop and show the result instead of hammering.
      if (code === "attempt_expired" || code === "attempt_finalised") {
        finished.current = true;
        nav(`/attempt/${enc(attempt.id)}/result`, { replace: true });
        return;
      }
      dirty.current = true;
      setSaveState("error");
      if (code === "version_conflict") version.current += 1; // another tab saved; retry on next tick
    }
  }, [attempt, answers, flagged, clock, nav]);

  // debounced autosave: 1.5 s after the last change
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => { void save(); }, 1500);
    return () => clearTimeout(t);
  }, [answers, flagged, save]);

  const finish = useCallback(async () => {
    if (!attempt || finished.current) return;
    finished.current = true; setBusy(true);
    try {
      await submitAttempt(attempt.id, answers);
      nav(`/attempt/${enc(attempt.id)}/result`, { replace: true });
    } catch (e) {
      // Past the deadline the server finalises on its own: the result page is
      // the truth, not an error screen.
      const code = errCode(e);
      if (code === "attempt_expired" || code === "attempt_finalised") {
        nav(`/attempt/${enc(attempt.id)}/result`, { replace: true });
        return;
      }
      finished.current = false; setBusy(false);
      setErr(errData(e).error || "Submit failed. Check your connection and try again.");
    }
  }, [attempt, answers, nav]);

  if (startErr) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-3 p-4">
        <InlineError message={startErr} onRetry={boot} />
        <Link className="text-center text-sm underline" to={`/assessment/${enc(id)}`}>Back to the assessment</Link>
      </div>
    );
  }
  if (!attempt || questions.length === 0) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;

  const q = questions[cur];
  const pick = (n: number) => { dirty.current = true; setAnswers((a) => ({ ...a, [q.id]: n })); };
  const flag = () => { dirty.current = true; setFlagged((f) => (f.includes(q.id) ? f.filter((x) => x !== q.id) : [...f, q.id])); };
  const answered = questions.filter((x) => answers[x.id] > 0).length;

  const view = (
    <div className="mx-auto flex max-w-xl flex-col gap-3 p-4 pb-6">
      <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-2 border-b border-border bg-card/95 px-4 py-2 backdrop-blur">
        <span className="text-sm font-bold text-foreground">
          {cur + 1} <span className="font-normal text-muted-foreground">/ {questions.length}</span>
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
          {saveState === "saving" && <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>}
          {saveState === "saved" && <><Check className="h-3.5 w-3.5 text-green-600" /> Saved</>}
          {saveState === "error" && <><AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Will retry</>}
        </span>
        <Timer endsAt={attempt.expires_at} now={clock.now} onExpire={finish} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="whitespace-pre-wrap text-base text-foreground">{q.question_text}</p>
        <ZoomImage src={q.question_image} alt={`Illustration for question ${cur + 1}`} />
      </div>

      <div className="flex flex-col gap-2" role="radiogroup" aria-label={`Options for question ${cur + 1}`}>
        {q.multiple_choice.map((opt, i) => (
          <button key={i} role="radio" aria-checked={answers[q.id] === i + 1} onClick={() => pick(i + 1)}
            className={cn("flex items-start gap-2 rounded-xl border p-3 text-left text-sm transition active:scale-[0.99]",
              answers[q.id] === i + 1 ? "border-blue-600 bg-blue-50 font-semibold text-foreground" : "border-border bg-card text-foreground")}>
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
              {String.fromCharCode(65 + i)}
            </span>
            <span className="min-w-0 flex-1">
              {opt}
              {/* Plain img on purpose: the option is already a button, so a zoom button cannot nest inside it. */}
              {q.option_images?.[i] && <img src={q.option_images[i]} alt={`Option ${String.fromCharCode(65 + i)}`}
                onError={(e) => { e.currentTarget.style.display = "none"; }}
                className="mt-2 max-h-32 w-auto rounded-lg border border-border object-contain" />}
            </span>
          </button>
        ))}
      </div>

      <Palette questions={questions} answers={answers} flagged={flagged} current={cur} onPick={setCur} />

      <div className="flex gap-2">
        <button className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold disabled:opacity-40" disabled={cur === 0} onClick={() => setCur(cur - 1)}>Back</button>
        <button className={cn("h-11 rounded-xl border px-4 text-sm font-semibold", flagged.includes(q.id) ? "border-amber-400 bg-amber-50 text-amber-700" : "border-border text-foreground")} onClick={flag}>
          <Flag className="mr-1 inline h-4 w-4" aria-hidden />{flagged.includes(q.id) ? "Flagged" : "Flag"}
        </button>
        <button className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold disabled:opacity-40" disabled={cur === questions.length - 1} onClick={() => setCur(cur + 1)}>Next</button>
      </div>

      {err && <InlineError message={err} onRetry={finish} />}
      <button className="h-12 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50" disabled={busy}
        onClick={() => { if (window.confirm(`Submit now? ${answered} of ${questions.length} answered, ${flagged.length} flagged.`)) void finish(); }}>
        Submit ({answered}/{questions.length})
      </button>
    </div>
  );

  // The anti-cheat layer belongs to the live answering screen only: loading and
  // error states above must not trap the student behind a tab-switch cover.
  return <ScreenshotProtection enabled={!busy}>{view}</ScreenshotProtection>;
}
