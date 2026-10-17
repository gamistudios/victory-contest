// Admin leaderboards (plan Phase 3): boards per program / stream / period, or one assessment. View-only.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAdminCatalog } from "@/services/catalogServices";
import { getAdminBoard, type Period } from "./api";

const PERIODS: { id: Period; label: string }[] = [
  { id: "day", label: "Today" }, { id: "week", label: "This week" },
  { id: "month", label: "This month" }, { id: "all", label: "All time" },
];

export default function LeaderboardsPage() {
  const [period, setPeriod] = useState<Period>("week");
  const [program, setProgram] = useState("");
  const [stream, setStream] = useState("");
  const [contestId, setContestId] = useState("");
  const catalog = useQuery({ queryKey: ["admin-catalog"], queryFn: () => getAdminCatalog() });
  const programs = catalog.data?.programs ?? [];
  const streams = (catalog.data?.streams ?? []).filter((s: any) => !program || !s.program_id || s.program_id === program);
  useEffect(() => { if (!program && programs.length) setProgram((programs[0] as any).id); }, [programs, program]);

  const board = useQuery({
    queryKey: ["admin-board", contestId, period, program, stream],
    queryFn: () => getAdminBoard(contestId ? { contest_id: contestId } : { period, program, stream: stream || undefined }),
    enabled: !!contestId || !!program,
  });

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">Leaderboards</h1>
      <div className="flex flex-wrap gap-2">
        <select className="rounded border p-2" value={program} onChange={(e) => { setProgram(e.target.value); setStream(""); }}>
          {programs.map((p: any) => <option key={p.id} value={p.id}>{p.name ?? p.id}</option>)}
        </select>
        <select className="rounded border p-2" value={stream} onChange={(e) => setStream(e.target.value)}>
          <option value="">Whole program</option>
          {streams.map((s: any) => <option key={s.id} value={s.id}>{s.name ?? s.id}</option>)}
        </select>
        <select className="rounded border p-2" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
          {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <input className="rounded border p-2" placeholder="or assessment id" value={contestId} onChange={(e) => setContestId(e.target.value.trim())} />
      </div>
      {board.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {board.isError && <p className="text-sm text-red-600">Could not load this board.</p>}
      {board.data && (
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left"><th className="p-2">#</th><th>Student</th><th>Points</th><th>Attempts</th><th>Avg %</th><th>Time</th><th></th></tr></thead>
          <tbody>
            {board.data.entries.map((e) => (
              <tr key={e.student_id} className="border-b">
                <td className="p-2">{e.rank}</td><td>{e.name}</td><td>{e.points}</td><td>{e.attempts}</td>
                <td>{e.avg_percent}%</td><td>{Math.round(e.seconds / 60)}m</td><td>{e.late ? "late" : ""}</td>
              </tr>
            ))}
            {board.data.entries.length === 0 && <tr><td className="p-2 text-muted-foreground" colSpan={7}>No rows on this board.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
