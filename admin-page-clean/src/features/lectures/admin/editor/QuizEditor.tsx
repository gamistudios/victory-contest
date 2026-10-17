import { useState } from "react";
import { Check, HelpCircle, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/features/lectures/components/States";
import { cn } from "@/lib/utils";
import type { Difficulty, ModuleQuiz, QuestionType, QuizQuestion } from "@/types/academy";
import { Chip, Field, IconBtn, Panel, Segmented, Stepper, areaCls, inputCls, uid } from "../components/kit";
import { Expandable } from "./parts";

const TYPES: Array<{ value: QuestionType; label: string }> = [
  { value: "multiple_choice", label: "Choice" },
  { value: "true_false", label: "T / F" },
  { value: "multiple_answer", label: "Multi" },
  { value: "scenario", label: "Scenario" },
];
const DIFFS: Difficulty[] = ["Easy", "Medium", "Hard"];
const TF = ["True", "False"];

const newQuestion = (): QuizQuestion => ({ id: uid("q"), type: "multiple_choice", question: "", options: ["", "", "", ""], correct_answers: [], explanation: "", difficulty: "Medium", topic_tag: "" });

function retype(q: QuizQuestion, type: QuestionType): QuizQuestion {
  const answers = q.correct_answers ?? [];
  if (type === "true_false") return { ...q, type, options: TF, correct_answers: answers.filter((i) => i < 2).slice(0, 1) };
  const opts = q.type === "true_false" || (q.options ?? []).length < 2 ? ["", "", "", ""] : (q.options ?? []);
  const keep = q.type === "true_false" ? [] : answers;
  return { ...q, type, options: opts, correct_answers: type === "multiple_answer" ? keep : keep.slice(0, 1) };
}

function QuestionCard({ q, index, error, onChange, onRemove }: { q: QuizQuestion; index: number; error?: string; onChange: (q: QuizQuestion) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(!q.question);
  const opts = q.options ?? [];
  const answers = q.correct_answers ?? [];
  const multi = q.type === "multiple_answer";
  const fixed = q.type === "true_false";
  const toggle = (i: number) => {
    const has = answers.includes(i);
    onChange({ ...q, correct_answers: multi ? (has ? answers.filter((x) => x !== i) : [...answers, i].sort()) : [i] });
  };
  const setOpt = (i: number, v: string) => onChange({ ...q, options: opts.map((o, j) => (j === i ? v : o)) });
  const removeOpt = (i: number) => onChange({ ...q, options: opts.filter((_, j) => j !== i), correct_answers: answers.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)) });

  return (
    <Expandable
      open={open}
      onToggle={() => setOpen((o) => !o)}
      invalid={!!error}
      summary={
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">{index + 1}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{q.question || "New question"}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {TYPES.find((t) => t.value === q.type)?.label} · {answers.length} correct
              {error && <span className="font-semibold text-destructive"> · {error}</span>}
            </p>
          </div>
        </div>
      }
    >
      <Segmented<QuestionType> label="Question type" compact value={q.type} onChange={(t) => onChange(retype(q, t))} options={TYPES} />
      {q.type === "scenario" && (
        <Field label="Scenario" htmlFor={`${q.id}-s`}>
          <textarea id={`${q.id}-s`} rows={3} className={areaCls} value={q.scenario_context ?? ""} onChange={(e) => onChange({ ...q, scenario_context: e.target.value })} />
        </Field>
      )}
      <Field label="Question" htmlFor={`${q.id}-q`} error={error && !q.question.trim() ? error : undefined}>
        <textarea id={`${q.id}-q`} rows={2} className={areaCls} value={q.question} onChange={(e) => onChange({ ...q, question: e.target.value })} />
      </Field>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Options · tap the check for correct</legend>
        {opts.map((o, i) => {
          const on = answers.includes(i);
          return (
            <div key={i} className="flex items-center gap-2">
              <button type="button" role={multi ? "checkbox" : "radio"} aria-checked={on} aria-label={`Option ${i + 1} is correct`} onClick={() => toggle(i)} className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-transparent bg-green-fix-600 text-white" : "border-border bg-card text-muted-foreground")}>
                {on ? <Check className="h-5 w-5" aria-hidden /> : <span className="text-xs font-bold">{String.fromCharCode(65 + i)}</span>}
              </button>
              {fixed ? <p className="flex-1 text-sm font-semibold">{o}</p> : <input aria-label={`Option ${i + 1} text`} className={inputCls} value={o} onChange={(e) => setOpt(i, e.target.value)} placeholder={`Option ${String.fromCharCode(65 + i)}`} />}
              {!fixed && opts.length > 2 && <IconBtn label={`Remove option ${i + 1}`} icon={X} tone="ghost" onClick={() => removeOpt(i)} />}
            </div>
          );
        })}
        {!fixed && opts.length < 6 && (
          <Button type="button" variant="outline" className="h-11" onClick={() => onChange({ ...q, options: [...opts, ""] })}>
            <Plus className="h-4 w-4" aria-hidden /> Option
          </Button>
        )}
      </fieldset>
      <Field label="Explanation" htmlFor={`${q.id}-e`}>
        <textarea id={`${q.id}-e`} rows={2} className={areaCls} value={q.explanation} onChange={(e) => onChange({ ...q, explanation: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Hint" htmlFor={`${q.id}-h`}>
          <input id={`${q.id}-h`} className={inputCls} value={q.hint ?? ""} onChange={(e) => onChange({ ...q, hint: e.target.value })} />
        </Field>
        <Field label="Topic tag" htmlFor={`${q.id}-t`}>
          <input id={`${q.id}-t`} className={inputCls} value={q.topic_tag} onChange={(e) => onChange({ ...q, topic_tag: e.target.value })} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2" role="group" aria-label="Difficulty">
          {DIFFS.map((d) => (
            <Chip key={d} active={q.difficulty === d} onClick={() => onChange({ ...q, difficulty: d })}>
              {d}
            </Chip>
          ))}
        </div>
        <Button type="button" variant="ghost" className="h-11 text-destructive hover:text-destructive" onClick={onRemove}>
          <Trash2 className="h-4 w-4" aria-hidden /> Remove
        </Button>
      </div>
    </Expandable>
  );
}

export function QuizEditor({ quiz, moduleTitle, errors, onChange }: { quiz: ModuleQuiz | null | undefined; moduleTitle: string; errors: Record<string, string>; onChange: (q: ModuleQuiz | null) => void }) {
  const questions = quiz?.questions ?? [];
  const base: ModuleQuiz = quiz ?? { id: uid("quiz"), title: `${moduleTitle || "Module"} — Check`, duration_minutes: 10, passing_score_percentage: 60, questions: [] };
  const setQs = (qs: QuizQuestion[]) => onChange({ ...base, questions: qs });
  return (
    <div className="space-y-3">
      <Panel className="space-y-3">
        <Field label="Quiz title" htmlFor="quiz-title">
          <input id="quiz-title" className={inputCls} value={base.title} onChange={(e) => onChange({ ...base, title: e.target.value })} />
        </Field>
        <div className="flex flex-wrap gap-4">
          <Field label="Time">
            <Stepper label="duration" suffix="min" value={base.duration_minutes} min={1} max={180} onChange={(n) => onChange({ ...base, duration_minutes: n })} />
          </Field>
          <Field label="Pass mark">
            <Stepper label="pass mark" suffix="%" value={base.passing_score_percentage} min={10} max={100} step={5} onChange={(n) => onChange({ ...base, passing_score_percentage: n })} />
          </Field>
        </div>
      </Panel>
      {questions.length === 0 && <EmptyState icon={<HelpCircle className="h-6 w-6" />} title="No questions" hint="Add one by hand or generate drafts with AI." />}
      {questions.map((q, i) => (
        <QuestionCard key={q.id} q={q} index={i} error={errors[q.id]} onChange={(nq) => setQs(questions.map((x) => (x.id === q.id ? nq : x)))} onRemove={() => setQs(questions.filter((x) => x.id !== q.id))} />
      ))}
      <Button type="button" variant="outline" className="h-11" onClick={() => setQs([...questions, newQuestion()])}>
        <Plus className="h-4 w-4" aria-hidden /> Add question
      </Button>
    </div>
  );
}
