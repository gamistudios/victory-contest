import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { assessmentLeaderboard, type LeaderboardRow } from "./api";

export default function AssessmentLeaderboard() {
  const { id = "" } = useParams();
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  useEffect(() => { assessmentLeaderboard(id).then(setRows).catch(() => setRows([])); }, [id]);
  if (!rows) return <div className="p-4 text-sm">Loading…</div>;
  return (
    <ol className="mx-auto flex max-w-xl flex-col gap-2 p-4">
      {rows.map((r) => (
        <li key={r.student_id} className="flex items-center justify-between rounded-xl border p-3 text-sm">
          <span>{r.rank}. {r.name || "Student"}{r.is_late ? " (late)" : ""}</span>
          <span className="font-semibold">{r.points} pts</span>
        </li>
      ))}
      {rows.length === 0 && <p className="text-sm opacity-70">No results yet.</p>}
    </ol>
  );
}
