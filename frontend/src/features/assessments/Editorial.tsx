import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BookOpen, CheckCircle2 } from "lucide-react";
import { CardSkeleton, EmptyState, InlineError } from "@/academy/components/States";
import { cn } from "@/lib/utils";
import { enc, getAssessmentEditorial, type EditorialView } from "./api";
import ZoomImage from "./ZoomImage";

/**
 * The answers walkthrough for a closed assessment the student never attempted —
 * the reading the legacy editorial page served once a contest ended.
 */
export default function Editorial() {
  const { id = "" } = useParams();
  const [view, setView] = useState<EditorialView | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    setErr("");
    getAssessmentEditorial(id).then(setView).catch(() => setErr("Could not load the answers."));
  }, [id]);
  useEffect(() => { setView(null); load(); }, [load]);

  if (err) return <div className="mx-auto max-w-xl p-4"><InlineError message={err} onRetry={load} /></div>;
  if (!view) return <div className="mx-auto max-w-xl space-y-3 p-4"><CardSkeleton /><CardSkeleton /></div>;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 p-4 pb-24">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
            <BookOpen className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="font-nunito text-lg font-extrabold text-foreground">{view.title}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Answers and explanations{view.participated ? " · you took this one" : ""}</p>
          </div>
        </div>
      </div>

      {!view.visible && (
        <EmptyState icon={<BookOpen className="h-6 w-6" />} title="Nothing to show yet"
          hint={view.message || "The answers for this assessment are not open yet."} />
      )}

      {view.editorial?.map((q, i) => (
        <div key={q.id} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden />
            <p className="whitespace-pre-wrap text-sm font-medium text-foreground">{i + 1}. {q.question_text}</p>
          </div>
          <ZoomImage src={q.question_image} alt={`Illustration for question ${i + 1}`} />
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {q.multiple_choice.map((opt, oi) => (
              <li key={oi} className={cn("flex gap-2 rounded-lg px-2 py-1",
                oi + 1 === q.answer ? "bg-green-50 font-semibold text-green-900" : "text-foreground")}>
                <span className="shrink-0 font-bold text-muted-foreground">{String.fromCharCode(65 + oi)}.</span>
                <span className="min-w-0 flex-1">
                  {opt}
                  {q.option_images?.[oi] && (
                    <img src={q.option_images[oi]} alt={`Option ${String.fromCharCode(65 + oi)}`}
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                      className="mt-2 max-h-32 w-auto rounded-lg border border-border object-contain" />
                  )}
                </span>
              </li>
            ))}
          </ul>
          {q.explanation && <p className="mt-2 whitespace-pre-wrap border-t border-border pt-2 text-sm text-foreground/90">{q.explanation}</p>}
          <ZoomImage src={q.explanation_image} alt={`Explanation image for question ${i + 1}`} />
        </div>
      ))}

      <Link className="text-center text-sm underline text-muted-foreground" to={`/assessment/${enc(id)}`}>Back to the assessment</Link>
    </div>
  );
}
