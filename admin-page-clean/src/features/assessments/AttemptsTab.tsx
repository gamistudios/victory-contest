import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  downloadAttemptsCsv, labelOf, listAttempts, patchAttempt,
  type AdminAttempt, type AttemptAction, type AttemptLabel,
} from "@/services/assessmentServices";

const TABS: { id: AttemptLabel; name: string }[] = [
  { id: "", name: "All" }, { id: "on_time", name: "On time" }, { id: "late", name: "Late" },
  { id: "auto_submitted", name: "Auto-submitted" }, { id: "abandoned", name: "Abandoned" }, { id: "excluded", name: "Excluded" },
];

/** Attempts of one assessment: tabs by label, detail drawer, exclude / waive / re-grade / reset, CSV. */
export default function AttemptsTab({ contestId: propId }: { contestId?: string }) {
  const params = useParams();
  const contestId = propId ?? params.id ?? "";
  const [label, setLabel] = useState<AttemptLabel>("");
  const [rows, setRows] = useState<AdminAttempt[] | null>(null);
  const [open, setOpen] = useState<AdminAttempt | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    setRows(null);
    listAttempts(contestId, label).then(setRows).catch(() => { setErr("Could not load attempts."); setRows([]); });
  }, [contestId, label]);
  useEffect(load, [load]);

  const act = async (a: AdminAttempt, action: AttemptAction) => {
    let reason = "";
    if (action === "exclude" || action === "reset") {
      reason = window.prompt(action === "reset" ? "Reason for resetting this attempt (required). It is deleted, and the student can start again." : "Reason for excluding (required)") ?? "";
      if (!reason.trim()) return;
    }
    try { await patchAttempt(a.id, action, reason); setOpen(null); load(); }
    catch (e: any) { setErr(e?.response?.data?.error ?? "Action failed"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Button key={t.id || "all"} size="sm" variant={label === t.id ? "default" : "outline"} onClick={() => setLabel(t.id)}>{t.name}</Button>
        ))}
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => downloadAttemptsCsv(contestId, label)}>Export CSV</Button>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      {rows === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">No attempts.</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground"><th className="p-2">Student</th><th>Label</th><th>Score</th><th>Points</th><th>Time</th><th /></tr></thead>
          <tbody>
            {rows?.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="p-2">{a.student_id}</td>
                <td><Badge variant={a.is_late ? "destructive" : "secondary"}>{labelOf(a)}</Badge></td>
                <td>{a.correct}/{a.total}</td>
                <td>{a.points}{a.is_late && a.penalty_percent > 0 ? ` (−${a.penalty_percent}%)` : ""}</td>
                <td>{Math.round(a.duration_seconds / 60)} min</td>
                <td><Button size="sm" variant="ghost" onClick={() => setOpen(a)}>Details</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm space-y-3 overflow-y-auto border-l bg-background p-4 shadow-xl" role="dialog" aria-label="Attempt details">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Attempt</h3><Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Close</Button></div>
          <dl className="space-y-1 text-sm">
            <div><dt className="inline text-muted-foreground">Student: </dt><dd className="inline">{open.student_id}</dd></div>
            <div><dt className="inline text-muted-foreground">Status: </dt><dd className="inline">{open.status} ({labelOf(open)})</dd></div>
            <div><dt className="inline text-muted-foreground">Started: </dt><dd className="inline">{open.started_at}</dd></div>
            <div><dt className="inline text-muted-foreground">Submitted: </dt><dd className="inline">{open.submitted_at ?? "—"}</dd></div>
            <div><dt className="inline text-muted-foreground">Expires: </dt><dd className="inline">{open.expires_at}</dd></div>
            <div><dt className="inline text-muted-foreground">Score: </dt><dd className="inline">{open.correct}/{open.total} · {open.points} pts</dd></div>
            {open.excluded && <div><dt className="inline text-muted-foreground">Excluded: </dt><dd className="inline">{open.excluded_reason}</dd></div>}
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={open.excluded} onClick={() => act(open, "exclude")}>Exclude</Button>
            <Button size="sm" variant="outline" disabled={!open.is_late || open.penalty_waived} onClick={() => act(open, "waive_penalty")}>Waive late penalty</Button>
            <Button size="sm" variant="outline" onClick={() => act(open, "regrade")}>Re-grade</Button>
            <Button size="sm" variant="destructive" onClick={() => act(open, "reset")}>Reset attempt</Button>
          </div>
        </div>
      )}
    </div>
  );
}
