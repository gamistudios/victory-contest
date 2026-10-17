import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, CheckCircle2, ExternalLink, Eye, Loader2, Pencil, RefreshCw, Rocket, ShieldCheck, Sparkles, Trash2, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, InlineError } from "@/features/lectures/components/States";
import { useAsync } from "@/features/lectures/hooks/useAsync";
import { adminDeleteDraft, adminGenerateDrafts, adminGetDrafts, adminGetTree, adminUpdateDraft } from "@/services/academy/academyApi";
import type { AiDraft, Flashcard, QuizQuestion } from "@/types/academy";
import { cn } from "@/lib/utils";
import { ADMIN_BASE, IconBtn, PageTitle, Panel, StatusPill, areaCls, errMsg, inputCls, notifyDraftsChanged } from "./components/kit";
import { KIND_ICON, KIND_LABEL } from "./editor/AiGenerateCard";
import type { PublishStatus } from "@/types/academy";

const STEPS = [
  { icon: Sparkles, label: "AI draft" },
  { icon: Eye, label: "Review" },
  { icon: Pencil, label: "Edit" },
  { icon: Check, label: "Approve" },
  { icon: Rocket, label: "Publish" },
];

function Pipeline() {
  return (
    <Panel className="mb-4">
      <ol className="flex items-center justify-between gap-1 overflow-x-auto scrollbar-hide" aria-label="Review pipeline">
        {STEPS.map((s, i) => (
          <li key={s.label} className="flex items-center gap-1">
            <span className={cn("flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-bold", i === 0 ? "bg-amber-100 text-amber-800" : i === 4 ? "bg-green-100 text-green-800" : "bg-muted text-foreground")}>
              <s.icon className="h-4 w-4" aria-hidden />
              {s.label}
            </span>
            {i < STEPS.length - 1 && <span className="text-muted-foreground" aria-hidden>›</span>}
          </li>
        ))}
      </ol>
      <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-ink" aria-hidden />
        AI output is never published automatically. Approving adds it to the module; the module still needs to be published.
      </p>
    </Panel>
  );
}

/* ----------------------------- item editors ----------------------------- */

function CardItem({ c, onChange, onRemove }: { c: Flashcard; onChange: (c: Flashcard) => void; onRemove: () => void }) {
  const [edit, setEdit] = useState(false);
  return (
    <li className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          {edit ? (
            <>
              <textarea aria-label="Question" rows={2} className={areaCls} value={c.question} onChange={(e) => onChange({ ...c, question: e.target.value })} />
              <textarea aria-label="Answer" rows={2} className={areaCls} value={c.answer} onChange={(e) => onChange({ ...c, answer: e.target.value })} />
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-foreground">Q: {c.question}</p>
              <p className="text-sm text-muted-foreground">A: {c.answer}</p>
            </>
          )}
        </div>
        <IconBtn label={edit ? "Done editing card" : "Edit card"} icon={edit ? Check : Pencil} onClick={() => setEdit((e) => !e)} />
        <IconBtn label="Remove card" icon={Trash2} tone="danger" onClick={onRemove} />
      </div>
    </li>
  );
}

function QuestionItem({ q, onChange, onRemove }: { q: QuizQuestion; onChange: (q: QuizQuestion) => void; onRemove: () => void }) {
  const [edit, setEdit] = useState(false);
  const opts = q.options ?? [];
  // AI drafts are the least trustworthy source here: correct_answers can be missing.
  const answers = q.correct_answers ?? [];
  const toggle = (i: number) => {
    const has = answers.includes(i);
    onChange({ ...q, correct_answers: q.type === "multiple_answer" ? (has ? answers.filter((x) => x !== i) : [...answers, i]) : [i] });
  };
  return (
    <li className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          {edit ? <textarea aria-label="Question" rows={2} className={areaCls} value={q.question} onChange={(e) => onChange({ ...q, question: e.target.value })} /> : <p className="text-sm font-bold text-foreground">{q.question}</p>}
          <ul className="space-y-1.5">
            {opts.map((o, i) => {
              const ok = answers.includes(i);
              return (
                <li key={i} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm", ok ? "bg-green-100 font-semibold text-green-800" : "bg-muted text-foreground")}>
                  {edit ? (
                    <>
                      <button type="button" aria-label={`Option ${i + 1} is correct`} aria-pressed={ok} onClick={() => toggle(i)} className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", ok ? "bg-green-fix-600 text-white" : "bg-card text-muted-foreground")}>
                        <Check className="h-5 w-5" aria-hidden />
                      </button>
                      {q.type === "true_false" ? <span className="flex-1">{o}</span> : <input aria-label={`Option ${i + 1}`} className={inputCls} value={o} onChange={(e) => onChange({ ...q, options: opts.map((x, j) => (j === i ? e.target.value : x)) })} />}
                    </>
                  ) : (
                    <>
                      {ok ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> : <span className="h-4 w-4 shrink-0 rounded-full border border-border" aria-hidden />}
                      <span className="flex-1">{o}</span>
                      {ok && <span className="text-[11px] font-bold uppercase">Correct</span>}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {edit ? <textarea aria-label="Explanation" rows={2} className={areaCls} value={q.explanation} onChange={(e) => onChange({ ...q, explanation: e.target.value })} /> : q.explanation && <p className="text-xs text-muted-foreground">{q.explanation}</p>}
        </div>
        <IconBtn label={edit ? "Done editing question" : "Edit question"} icon={edit ? Check : Pencil} onClick={() => setEdit((e) => !e)} />
        <IconBtn label="Remove question" icon={Trash2} tone="danger" onClick={onRemove} />
      </div>
    </li>
  );
}

/* ------------------------------- draft card ------------------------------- */

function DraftCard({ draft, onDone }: { draft: AiDraft; onDone: () => void }) {
  const [cards, setCards] = useState<Flashcard[]>(draft.flashcards ?? []);
  const [qs, setQs] = useState<QuizQuestion[]>(draft.questions ?? []);
  const [text, setText] = useState(draft.text ?? "");
  const [items, setItems] = useState<string[]>(draft.items ?? []);
  const [busy, setBusy] = useState<null | "approve" | "reject" | "regen">(null);
  const Icon = KIND_ICON[draft.kind];

  const count = draft.kind === "flashcards" ? cards.length : draft.kind === "quiz" ? qs.length : draft.kind === "key_concepts" ? items.length : text.trim() ? 1 : 0;
  const edited = JSON.stringify({ cards, qs, text, items }) !== JSON.stringify({ cards: draft.flashcards ?? [], qs: draft.questions ?? [], text: draft.text ?? "", items: draft.items ?? [] });

  const body = () => (draft.kind === "flashcards" ? { flashcards: cards } : draft.kind === "quiz" ? { questions: qs } : draft.kind === "summary" ? { text } : { items });

  const run = async (kind: "approve" | "reject" | "regen") => {
    setBusy(kind);
    try {
      if (kind === "approve") {
        await adminUpdateDraft(draft.id, { ...body(), status: "approved" });
        toast.success("Approved and added to the module (still unpublished until you publish it)");
      } else if (kind === "reject") {
        await adminUpdateDraft(draft.id, { status: "rejected" });
        toast("Draft rejected");
      } else {
        await adminGenerateDrafts({ module_id: draft.module_id, kinds: [draft.kind], count: Math.max(count, 4), difficulty: "Mixed", source: draft.source });
        await adminDeleteDraft(draft.id);
        toast.success("New draft generated");
      }
      notifyDraftsChanged();
      onDone();
    } catch (e) {
      toast.error(errMsg(e));
      setBusy(null);
    }
  };

  return (
    <article className="rounded-2xl border border-border bg-card p-3 sm:p-4" aria-label={`${KIND_LABEL[draft.kind]} draft`}>
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <h3 className="font-nunito-sans text-sm font-bold">{KIND_LABEL[draft.kind]}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">from {draft.source}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
          <Sparkles className="h-3 w-3" aria-hidden /> AI draft
        </span>
        {edited && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">Edited</span>}
      </header>

      {draft.kind === "flashcards" && <ul className="space-y-2">{cards.map((c, i) => <CardItem key={c.id} c={c} onChange={(n) => setCards(cards.map((x, j) => (j === i ? n : x)))} onRemove={() => setCards(cards.filter((_, j) => j !== i))} />)}</ul>}
      {draft.kind === "quiz" && <ul className="space-y-2">{qs.map((q, i) => <QuestionItem key={q.id} q={q} onChange={(n) => setQs(qs.map((x, j) => (j === i ? n : x)))} onRemove={() => setQs(qs.filter((_, j) => j !== i))} />)}</ul>}
      {draft.kind === "summary" && <textarea aria-label="Summary" rows={6} className={areaCls} value={text} onChange={(e) => setText(e.target.value)} />}
      {draft.kind === "key_concepts" && (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2">
              <input aria-label={`Concept ${i + 1}`} className={inputCls} value={it} onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))} />
              <IconBtn label={`Remove concept ${i + 1}`} icon={X} tone="danger" onClick={() => setItems(items.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ul>
      )}
      {count === 0 && <p className="text-sm text-muted-foreground">Nothing left in this draft.</p>}

      <footer className="mt-4 grid grid-cols-3 gap-2">
        <Button className="h-11" disabled={!!busy || count === 0} onClick={() => run("approve")}>
          {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />} Approve
        </Button>
        <Button variant="outline" className="h-11" disabled={!!busy} onClick={() => run("regen")}>
          {busy === "regen" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />} <span className="truncate">Redo</span>
          <span className="sr-only"> (regenerate)</span>
        </Button>
        <Button variant="outline" className="h-11 text-destructive hover:text-destructive" disabled={!!busy} onClick={() => run("reject")}>
          <XCircle className="h-4 w-4" aria-hidden /> Reject
        </Button>
      </footer>
    </article>
  );
}

/* --------------------------------- page --------------------------------- */

export default function AiReview() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [drafts, tree] = await Promise.all([adminGetDrafts(), adminGetTree()]);
    return { drafts, tree: tree.tree };
  }, []);

  const groups = useMemo(() => {
    if (!data) return [];
    const info = new Map<string, { title: string; subject: string; status: PublishStatus }>();
    for (const s of data.tree) for (const c of s.chapters) for (const m of c.modules) info.set(m.id, { title: m.title, subject: s.name, status: m.publish_status });
    const by = new Map<string, AiDraft[]>();
    for (const d of data.drafts.filter((x) => x.status === "pending")) by.set(d.module_id, [...(by.get(d.module_id) ?? []), d]);
    return [...by.entries()].map(([id, drafts]) => ({ id, drafts, ...(info.get(id) ?? { title: "Unknown module", subject: "", status: "draft" as PublishStatus }) }));
  }, [data]);

  const total = groups.reduce((n, g) => n + g.drafts.length, 0);

  return (
    <div>
      <PageTitle title="AI review" hint={total ? `${total} draft${total === 1 ? "" : "s"} waiting` : "Review AI-made content before students see it"} />
      <Pipeline />
      {loading && !data ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading drafts">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : error ? (
        <InlineError message={error} onRetry={reload} />
      ) : groups.length === 0 ? (
        <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="All caught up" hint="Generate drafts from a module's Activities tab." action={<Link to={`${ADMIN_BASE}/content`} className="mt-2 inline-flex h-11 items-center rounded-xl bg-muted px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Open course builder</Link>} />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.id} aria-label={g.title} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-nunito-sans text-base font-bold">{g.title}</h2>
                  <p className="truncate text-xs text-muted-foreground">{g.subject}</p>
                </div>
                <StatusPill status={g.status} />
                <Link to={`${ADMIN_BASE}/module/${g.id}`} aria-label={`Open ${g.title} in editor`} className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </Link>
              </div>
              <div className="grid items-start gap-3 xl:grid-cols-2">
                {g.drafts.map((d) => (
                  <DraftCard key={d.id} draft={d} onDone={reload} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
