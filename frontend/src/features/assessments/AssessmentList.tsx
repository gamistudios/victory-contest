import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ClipboardList, Clock, HelpCircle, Lock, PlayCircle, CheckCircle2, Layers } from "lucide-react";
import { useCatalog } from "@/shared/scope/catalog";
import { cn } from "@/lib/utils";
import { CardSkeleton, EmptyState, InlineError } from "@/academy/components/States";
import { enc, listAssessments, type AssessmentMeta } from "./api";

/** Practice tab: GET /assessments with a program filter. */
export default function AssessmentList() {
  const { catalog } = useCatalog();
  const [programId, setProgramId] = useState("");
  const [items, setItems] = useState<AssessmentMeta[] | null>(null);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setItems(null); setErr("");
    listAssessments(programId ? { program_id: programId } : {}).then(setItems).catch(() => setErr("Could not load assessments."));
  }, [programId, tick]);

  const programs = useMemo(() => catalog?.programs.filter((p) => p.is_active) ?? [], [catalog]);
  const chips = [{ id: "", name: "All" }, ...programs.map((p) => ({ id: p.id, name: p.name }))];

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4 pb-28">
      <div>
        <h1 className="font-nunito text-2xl font-extrabold text-foreground">Practice</h1>
        <p className="text-sm text-muted-foreground">Exams and drills to test what you know.</p>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Program">
        {chips.map((c) => {
          const on = programId === c.id;
          return (
            <button key={c.id || "all"} role="tab" aria-selected={on} onClick={() => setProgramId(c.id)}
              className={cn("inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-bold transition active:scale-95",
                on ? "border-blue-600 bg-blue-600 text-white" : "border-border bg-card text-foreground hover:bg-muted")}>
              {!c.id && <Layers className="h-4 w-4" aria-hidden />}{c.name}
            </button>
          );
        })}
      </div>

      {err && <InlineError message={err} onRetry={() => setTick((t) => t + 1)} />}
      {items === null && !err && <div className="space-y-3"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>}
      {items?.length === 0 && (
        <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Nothing here yet"
          hint={programId ? "No assessments for this program yet. Try another one." : "New practice sets will show up here."} />
      )}

      <div className="flex flex-col gap-3">
        {items?.map((a) => {
          const att = a.my_attempt;
          const inProgress = att?.status === "in_progress";
          const done = !!att && !inProgress;
          return (
            <Link key={a.id} to={`/assessment/${enc(a.id)}`}
              className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition active:scale-[0.98]">
              <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                a.lock ? "bg-yellow-100 text-yellow-700" : done ? "bg-green-100 text-green-700" : inProgress ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground")}>
                {a.lock ? <Lock className="h-6 w-6" /> : done ? <CheckCircle2 className="h-6 w-6" /> : inProgress ? <PlayCircle className="h-6 w-6" /> : <ClipboardList className="h-6 w-6" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-bold text-foreground">{a.title}</p>
                  {a.lock && <span className="shrink-0 rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-semibold text-yellow-800">Premium</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-0.5 font-semibold capitalize">{a.kind.replace(/_/g, " ")}</span>
                  <span className="inline-flex items-center gap-1"><HelpCircle className="h-3.5 w-3.5" />{a.question_count}</span>
                  {a.duration_minutes ? <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{a.duration_minutes} min</span> : null}
                </div>
                {att && (
                  <p className={cn("mt-1 text-xs font-semibold", inProgress ? "text-blue-700" : "text-green-700")}>
                    {inProgress ? "In progress · tap to resume" : `Completed · ${att.points} pts`}
                  </p>
                )}
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-active:translate-x-0.5" aria-hidden />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
