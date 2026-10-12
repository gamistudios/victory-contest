import { CheckCircle2, ChevronRight, Clock, Lightbulb, RefreshCw, Sparkles, Timer, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Difficulty, ModuleQuiz, QuestionType, QuizAttempt, QuizQuestion } from "@/types/academy";
import { aiGenerateQuiz, getQuizAttempts, postQuizAttempt } from "@/services/academy/academyApi";
import { Markdown } from "../components/Markdown";
import { ProgressRing } from "../components/ProgressRing";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { fmtClock } from "../lib/theme";
import { useTelegram } from "@/hooks/useTelegram";

interface Props {
  moduleId: string;
  quiz: ModuleQuiz | null;
  quizLocked: boolean;
  aiLocked: boolean;
  onNeedUpgrade: (what: string) => void;
  onAttempt: () => void;
}

const TYPE_LABEL: Record<QuestionType, string> = { multiple_choice: "Multiple choice", true_false: "True / False", multiple_answer: "Multi-select", scenario: "Scenario" };
const DIFFS: Array<Difficulty | "Mixed"> = ["Mixed", "Easy", "Medium", "Hard"];

export function QuizTab({ moduleId, quiz, quizLocked, aiLocked, onNeedUpgrade, onAttempt }: Props) {
  const [run, setRun] = useState<{ quiz: ModuleQuiz; timed: boolean; source: "module" | "ai" } | null>(null);
  const [count, setCount] = useState(5);
  const [diff, setDiff] = useState<Difficulty | "Mixed">("Mixed");
  const [types, setTypes] = useState<QuestionType[]>(["multiple_choice", "true_false"]);
  const [timed, setTimed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<QuizAttempt[]>([]);

  const loadHistory = useCallback(() => getQuizAttempts(moduleId).then((h) => setHistory(h.slice(0, 5))).catch(() => undefined), [moduleId]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const generate = async () => {
    if (aiLocked) return onNeedUpgrade("AI quizzes");
    setBusy(true);
    try {
      const q = await aiGenerateQuiz({ module_id: moduleId, count, difficulty: diff, types });
      setRun({ quiz: q, timed, source: "ai" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (run) {
    return <QuizRunner key={run.quiz.id} moduleId={moduleId} quiz={run.quiz} timed={run.timed} source={run.source} onExit={() => { setRun(null); loadHistory(); onAttempt(); }} onRegenerate={generate} />;
  }

  const toggleType = (t: QuestionType) => setTypes((c) => (c.includes(t) ? (c.length > 1 ? c.filter((x) => x !== t) : c) : [...c, t]));

  return (
    <div className="space-y-4">
      {quiz && (
        <button
          disabled={!quiz.questions.length && !quizLocked}
          onClick={() => (quizLocked ? onNeedUpgrade("the module quiz") : setRun({ quiz, timed: false, source: "module" }))}
          className="flex w-full items-center gap-4 rounded-3xl bg-gradient-to-br from-blue-fix-700 to-blue-fix-500 p-5 text-left text-white active:scale-[0.99]"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-white/80">Module quiz</p>
            <p className="mt-0.5 font-nunito text-2xl font-extrabold">{quizLocked ? "Locked" : `${quiz.questions.length} questions`}</p>
            <p className="mt-1 flex items-center gap-3 text-xs font-semibold text-white/85"><span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{quiz.duration_minutes} min</span><span>Pass {quiz.passing_score_percentage}%</span></p>
          </div>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-blue-fix-700"><ChevronRight className="h-6 w-6" /></span>
        </button>
      )}

      <div className="rounded-3xl border border-border bg-card p-4">
        <p className="mb-3 flex items-center gap-2 font-nunito text-lg font-extrabold"><Sparkles className="h-5 w-5 text-violet-700" /> Test yourself</p>
        <div className="space-y-4">
          <div>
            <Label>Questions</Label>
            <div className="grid grid-cols-3 gap-2">{[5, 10, 15].map((n) => <Choice key={n} on={count === n} onClick={() => setCount(n)}>{n}</Choice>)}</div>
          </div>
          <div>
            <Label>Difficulty</Label>
            <div className="grid grid-cols-4 gap-2">{DIFFS.map((d) => <Choice key={d} on={diff === d} onClick={() => setDiff(d)}>{d}</Choice>)}</div>
          </div>
          <div>
            <Label>Types</Label>
            <div className="grid grid-cols-2 gap-2">{(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => <Choice key={t} on={types.includes(t)} onClick={() => toggleType(t)}>{TYPE_LABEL[t]}</Choice>)}</div>
          </div>
          <label className="flex items-center justify-between rounded-xl bg-muted/60 p-3">
            <span className="flex items-center gap-2 text-sm font-bold"><Timer className="h-4 w-4" /> Timed</span>
            <Switch checked={timed} onCheckedChange={setTimed} aria-label="Timed quiz" />
          </label>
          <Button disabled={busy} onClick={generate} className="h-14 w-full rounded-2xl bg-violet-fix-600 text-base font-bold text-white hover:bg-violet-fix-700">
            {busy ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />} Generate {count}-question quiz
          </Button>
        </div>
      </div>

      {history.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-bold">Recent attempts</p>
          <ul className="space-y-2">
            {history.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <span className={cn("flex h-10 w-10 items-center justify-center rounded-full text-sm font-extrabold", a.passed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")}>{a.percentage}</span>
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{a.score}/{a.total_questions} correct{a.source === "ai" ? " · AI quiz" : ""}</p><p className="text-xs text-muted-foreground">{new Date(a.completed_at).toLocaleDateString()}</p></div>
                {a.passed ? <CheckCircle2 className="h-5 w-5 text-green-700" /> : <XCircle className="h-5 w-5 text-red-700" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{children}</p>;
const Choice = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} aria-pressed={on} className={cn("h-11 rounded-xl border px-2 text-xs font-bold transition", on ? "border-violet-fix-600 bg-violet-100 text-violet-900" : "border-border bg-card")}>{children}</button>
);

/* ============================== runner ============================== */

function QuizRunner({ moduleId, quiz, timed, source, onExit, onRegenerate }: { moduleId: string; quiz: ModuleQuiz; timed: boolean; source: "module" | "ai"; onExit: () => void; onRegenerate: () => void }) {
  const qs = quiz.questions;
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<Record<number, number[]>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [hint, setHint] = useState(false);
  const [finished, setFinished] = useState(false);
  const [left, setLeft] = useState(quiz.duration_minutes * 60);
  const { hapticFeedback } = useTelegram();

  const isRight = (q: QuizQuestion, sel: number[] = []) => sel.length === q.correct_answers.length && q.correct_answers.every((c) => sel.includes(c));
  const score = useMemo(() => qs.filter((q, n) => isRight(q, picked[n])).length, [qs, picked]);

  const finish = useCallback(async () => {
    if (finished) return;
    setFinished(true);
    const weak = Array.from(new Set(qs.filter((q, n) => !isRight(q, picked[n])).map((q) => q.topic_tag)));
    try {
      await postQuizAttempt({ module_id: moduleId, quiz_id: quiz.id, score, total_questions: qs.length, weak_topics: weak, source, passing: quiz.passing_score_percentage });
    } catch { /* offline: still show result */ }
  }, [finished, qs, picked, moduleId, quiz, score, source]);

  useEffect(() => {
    if (!timed || finished) return;
    const t = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(t);
  }, [timed, finished]);
  useEffect(() => { if (timed && left <= 0) finish(); }, [left, timed, finish]);

  if (!qs.length) return <div className="p-6 text-center text-sm text-muted-foreground">No questions yet.</div>;

  /* ------------------------------ result ------------------------------ */
  if (finished) {
    const pct = Math.round((score / qs.length) * 100);
    const pass = pct >= quiz.passing_score_percentage;
    const weak = Array.from(new Set(qs.filter((q, n) => !isRight(q, picked[n])).map((q) => q.topic_tag)));
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <ProgressRing value={pct} size={128} stroke={11} arcClass={pass ? "stroke-green-fix-600" : "stroke-red-fix-500"} />
          <h3 className="font-nunito text-2xl font-extrabold">{pass ? "Well done!" : "Keep going!"}</h3>
          <p className="text-sm text-muted-foreground">{score} of {qs.length} correct</p>
        </div>
        {weak.length > 0 && (
          <div><p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Review these topics</p><div className="flex flex-wrap gap-2">{weak.map((w) => <span key={w} className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-900">{w}</span>)}</div></div>
        )}
        <ul className="space-y-2">
          {qs.map((q, n) => {
            const ok = isRight(q, picked[n]);
            return (
              <li key={q.id} className="rounded-xl border border-border bg-card">
                <details>
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
                    {ok ? <CheckCircle2 className="h-5 w-5 shrink-0 text-green-700" /> : <XCircle className="h-5 w-5 shrink-0 text-red-700" />}
                    <span className="line-clamp-2 flex-1 text-sm font-semibold">{n + 1}. {q.question}</span>
                  </summary>
                  <div className="space-y-2 border-t border-border p-3 text-sm">
                    <p><span className="font-bold">Correct: </span>{q.correct_answers.map((c) => q.options?.[c]).join(" · ")}</p>
                    <Markdown source={q.explanation} className="!text-sm text-muted-foreground [&_p]:m-0" />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
        <div className="grid gap-2">
          <Button className="h-12 rounded-xl bg-blue-fix-600 font-bold text-white" onClick={() => { setPicked({}); setChecked({}); setI(0); setFinished(false); setLeft(quiz.duration_minutes * 60); }}>Retry</Button>
          <Button variant="outline" className="h-12 rounded-xl" onClick={() => { onExit(); setTimeout(onRegenerate, 0); }}><Sparkles className="h-4 w-4" /> New AI quiz</Button>
          <Button variant="ghost" className="h-12" onClick={onExit}>Close</Button>
        </div>
      </div>
    );
  }

  /* ------------------------------ question ------------------------------ */
  const q = qs[i];
  const multi = q.type === "multiple_answer";
  const sel = picked[i] ?? [];
  const done = !!checked[i];
  const choose = (o: number) => {
    if (done) return;
    hapticFeedback("selection");
    if (multi) setPicked({ ...picked, [i]: sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o] });
    else { setPicked({ ...picked, [i]: [o] }); setChecked({ ...checked, [i]: true }); hapticFeedback("notification", isRight(q, [o]) ? "success" : "error"); }
  };
  const next = () => { setHint(false); if (i + 1 >= qs.length) finish(); else setI(i + 1); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1" aria-label={`Question ${i + 1} of ${qs.length}`}>
          {qs.map((_, n) => <span key={n} className={cn("h-1.5 flex-1 rounded-full", n < i ? "bg-brand" : n === i ? "bg-blue-fix-600" : "bg-muted")} />)}
        </div>
        {timed && <span className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums", left < 30 ? "bg-red-100 text-red-800" : "bg-muted")}><Timer className="h-3.5 w-3.5" />{fmtClock(Math.max(0, left))}</span>}
      </div>

      <div className="rounded-3xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground"><span>{i + 1}/{qs.length} · {TYPE_LABEL[q.type]}</span><span>{q.difficulty}</span></div>
        {q.scenario_context && <p className="mb-2 rounded-xl bg-muted p-3 text-sm italic">{q.scenario_context}</p>}
        <Markdown source={q.question} className="!text-[1.05rem] font-bold [&_p]:m-0" />
      </div>

      <ul className="space-y-2.5" role={multi ? "group" : "radiogroup"}>
        {(q.options ?? []).map((o, n) => {
          const on = sel.includes(n);
          const correct = q.correct_answers.includes(n);
          return (
            <li key={n}>
              <button
                onClick={() => choose(n)}
                role={multi ? "checkbox" : "radio"}
                aria-checked={on}
                disabled={done}
                className={cn(
                  "flex min-h-[3.5rem] w-full items-center gap-3 rounded-2xl border-2 p-3 text-left text-sm font-semibold transition active:scale-[0.99]",
                  !done && (on ? "border-blue-fix-600 bg-blue-50" : "border-border bg-card"),
                  done && correct && "border-green-fix-600 bg-green-50 text-green-950",
                  done && on && !correct && "border-red-fix-500 bg-red-50 text-red-950",
                  done && !on && !correct && "border-border bg-card opacity-60",
                )}
              >
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold", multi && "rounded-md", on ? "bg-blue-fix-600 text-white" : "bg-muted")}>{String.fromCharCode(65 + n)}</span>
                <span className="flex-1"><Markdown source={o} className="!text-sm [&_p]:m-0" /></span>
                {done && correct && <CheckCircle2 className="h-5 w-5 shrink-0 text-green-700" />}
                {done && on && !correct && <XCircle className="h-5 w-5 shrink-0 text-red-700" />}
              </button>
            </li>
          );
        })}
      </ul>

      {!done && q.hint && (
        <button onClick={() => setHint((h) => !h)} className="flex items-center gap-1.5 text-xs font-bold text-amber-800"><Lightbulb className="h-4 w-4" />{hint ? q.hint : "Need a hint?"}</button>
      )}
      {done && (
        <div className={cn("rounded-2xl p-4 text-sm", isRight(q, sel) ? "bg-green-50 text-green-950" : "bg-red-50 text-red-950")}>
          <p className="mb-1 font-extrabold">{isRight(q, sel) ? "Correct!" : "Not quite"}</p>
          <Markdown source={q.explanation} className="!text-sm [&_p]:m-0" />
        </div>
      )}

      <div className="flex gap-2">
        {multi && !done && <Button disabled={!sel.length} className="h-12 flex-1 rounded-xl bg-blue-fix-600 font-bold text-white" onClick={() => setChecked({ ...checked, [i]: true })}>Check answer</Button>}
        {done && <Button className="h-12 flex-1 rounded-xl bg-blue-fix-600 font-bold text-white" onClick={next}>{i + 1 >= qs.length ? "See results" : "Next"}<ChevronRight className="h-5 w-5" /></Button>}
        {!done && !multi && <Button variant="ghost" className="h-12 flex-1" onClick={() => { setChecked({ ...checked, [i]: true }); }}>Skip</Button>}
      </div>
    </div>
  );
}
