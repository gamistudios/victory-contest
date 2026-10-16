import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useServerClock } from "@/shared/data/useServerClock";
import { autosave, enc, errCode, startAssessment, submitAttempt, type Attempt, type PublicQuestion } from "./api";
import Palette from "./Palette";
import Timer from "./Timer";

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
  const [busy, setBusy] = useState(false);
  const version = useRef(0);
  const dirty = useRef(false);
  const finished = useRef(false);

  useEffect(() => {
    startAssessment(id).then((r) => {
      clock.sync(r.server_now);
      setAttempt(r.attempt); setQuestions(r.questions);
      setAnswers(r.attempt.answers ?? {} as Record<string, number>);
      setFlagged(r.attempt.flagged ?? []);
      version.current = r.attempt.answers_version;
    }).catch((e) => {
      if (errCode(e) === "already_attempted") nav(`/attempt/${enc(e.response.data.attempt_id)}/result`, { replace: true });
      else if (e?.response?.status === 402) nav(`/assessment/${enc(id)}`, { replace: true });
      else setErr(e?.response?.data?.error ?? "Could not start the assessment.");
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async () => {
    if (!attempt || !dirty.current || finished.current) return;
    dirty.current = false;
    try {
      const r = await autosave(attempt.id, answers, flagged, version.current);
      version.current = r.version; clock.sync(r.server_now);
    } catch (e) {
      dirty.current = true;
      if (errCode(e) === "version_conflict") version.current += 1; // another tab saved; retry on next tick
    }
  }, [attempt, answers, flagged, clock]);

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
    } catch (e: any) {
      finished.current = false; setBusy(false);
      setErr(e?.response?.data?.error ?? "Submit failed. Check your connection and try again.");
    }
  }, [attempt, answers, nav]);

  if (err && !attempt) return <div className="p-4 text-sm text-red-600">{err}</div>;
  if (!attempt || questions.length === 0) return <div className="p-4 text-sm">Loading…</div>;
  const q = questions[cur];
  const pick = (n: number) => { dirty.current = true; setAnswers((a) => ({ ...a, [q.id]: n })); };
  const flag = () => { dirty.current = true; setFlagged((f) => (f.includes(q.id) ? f.filter((x) => x !== q.id) : [...f, q.id])); };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm">Question {cur + 1} / {questions.length}</span>
        <Timer endsAt={attempt.expires_at} now={clock.now} onExpire={finish} />
      </div>
      <div className="rounded-2xl border p-4">
        <p className="whitespace-pre-wrap text-base">{q.question_text}</p>
        {q.question_image && <img src={q.question_image} alt="" className="mt-3 max-h-64 rounded-lg" />}
      </div>
      <div className="flex flex-col gap-2" role="radiogroup">
        {q.multiple_choice.map((opt, i) => (
          <button key={i} role="radio" aria-checked={answers[q.id] === i + 1} onClick={() => pick(i + 1)}
            className={`rounded-xl border p-3 text-left text-sm ${answers[q.id] === i + 1 ? "border-primary bg-primary/10" : ""}`}>
            {opt}
            {q.option_images?.[i] && <img src={q.option_images[i]} alt="" className="mt-2 max-h-32 rounded" />}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button className="h-11 flex-1 rounded-xl border text-sm" disabled={cur === 0} onClick={() => setCur(cur - 1)}>Back</button>
        <button className="h-11 rounded-xl border px-4 text-sm" onClick={flag}>{flagged.includes(q.id) ? "Unflag" : "Flag"}</button>
        <button className="h-11 flex-1 rounded-xl border text-sm" disabled={cur === questions.length - 1} onClick={() => setCur(cur + 1)}>Next</button>
      </div>
      <Palette questions={questions} answers={answers} flagged={flagged} current={cur} onPick={setCur} />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button className="h-12 rounded-xl bg-primary text-primary-foreground" disabled={busy}
        onClick={() => { if (window.confirm("Submit your answers now?")) void finish(); }}>Submit</button>
    </div>
  );
}
