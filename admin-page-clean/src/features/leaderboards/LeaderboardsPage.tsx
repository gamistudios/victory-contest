// Admin leaderboards (plan Phase 3): boards per program / stream / period, or one assessment. View-only.
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/shared/ui/DataTable";
import FilterBar from "@/shared/ui/FilterBar";
import { useQuery } from "@tanstack/react-query";
import { getAdminCatalog } from "@/services/catalogServices";
import { getAdminBoard, type BoardEntry, type Period } from "./api";
import { useScope } from "@/app/ProgramContext";

type Entry = BoardEntry;
const columns: ColumnDef<Entry, any>[] = [
  { accessorKey: "rank", header: "#" },
  { accessorKey: "name", header: "Student" },
  { accessorKey: "points", header: "Points" },
  { accessorKey: "attempts", header: "Attempts" },
  { id: "avg", header: "Avg %", accessorFn: (e) => e.avg_percent, cell: (c) => `${c.getValue()}%` },
  { id: "time", header: "Time", accessorFn: (e) => Math.round(e.seconds / 60), cell: (c) => `${c.getValue()}m` },
  { id: "late", header: "Late", accessorFn: (e) => (e.late ? "late" : "") },
];

const PERIODS: { id: Period; label: string }[] = [
  { id: "day", label: "Today" }, { id: "week", label: "This week" },
  { id: "month", label: "This month" }, { id: "all", label: "All time" },
];

export default function LeaderboardsPage() {
  const headerScope = useScope(); // header "Working in" switcher seeds the board (plan 5.8)
  const [period, setPeriod] = useState<Period>("week");
  const [program, setProgram] = useState(headerScope.program);
  const [stream, setStream] = useState(headerScope.stream);
  const [contestId, setContestId] = useState("");
  const catalog = useQuery({ queryKey: ["admin-catalog"], queryFn: () => getAdminCatalog() });
  const programs = catalog.data?.programs ?? [];
  const streams = (catalog.data?.streams ?? []).filter((s: any) => !program || !s.program_id || s.program_id === program);
  useEffect(() => { setProgram(headerScope.program); setStream(headerScope.stream); }, [headerScope.program, headerScope.stream]);
  useEffect(() => { if (!program && programs.length) setProgram((programs[0] as any).id); }, [programs, program]);

  const board = useQuery({
    queryKey: ["admin-board", contestId, period, program, stream],
    queryFn: () => getAdminBoard(contestId ? { contest_id: contestId } : { period, program, stream: stream || undefined }),
    enabled: !!contestId || !!program,
  });

  const [search, setSearch] = useState("");
  const rows = useMemo(
    () => (board.data?.entries ?? []).filter((e) => !search || e.name.toLowerCase().includes(search.toLowerCase())),
    [board.data, search],
  );

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
      {board.isError && <p className="text-sm text-red-600">Could not load this board.</p>}
      <FilterBar search={search} onSearch={setSearch} placeholder="Search student…" />
      <DataTable<Entry>
        columns={columns}
        data={rows}
        loading={board.isLoading}
        empty="No rows on this board."
        csvName={`leaderboard-${contestId || program}-${period}`}
      />
    </div>
  );
}
