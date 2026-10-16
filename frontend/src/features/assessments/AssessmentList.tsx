import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useCatalog } from "@/shared/scope/catalog";
import { enc, listAssessments, type AssessmentMeta } from "./api";

const sel = "h-11 rounded-xl border border-input bg-background px-3 text-sm";

/** Practice tab: GET /assessments with a program filter. */
export default function AssessmentList() {
  const { catalog } = useCatalog();
  const [programId, setProgramId] = useState("");
  const [items, setItems] = useState<AssessmentMeta[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setItems(null);
    listAssessments(programId ? { program_id: programId } : {}).then(setItems).catch(() => setErr("Could not load assessments."));
  }, [programId]);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 p-4">
      <select className={sel} value={programId} onChange={(e) => setProgramId(e.target.value)} aria-label="Program">
        <option value="">All programs</option>
        {catalog?.programs.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {items === null && !err && <p className="text-sm">Loading…</p>}
      {items?.length === 0 && <p className="text-sm opacity-70">Nothing here yet.</p>}
      {items?.map((a) => (
        <Link key={a.id} to={`/assessment/${enc(a.id)}`} className="rounded-2xl border p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">{a.title}</span>
            {a.lock && <span className="text-xs">Premium</span>}
          </div>
          <p className="text-xs opacity-70">
            {a.kind} · {a.question_count} questions{a.duration_minutes ? ` · ${a.duration_minutes} min` : ""}
            {a.my_attempt ? ` · ${a.my_attempt.status === "in_progress" ? "in progress" : `${a.my_attempt.points} pts`}` : ""}
          </p>
        </Link>
      ))}
    </div>
  );
}
