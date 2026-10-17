// Admin leaderboards (plan Phase 3): boards per program / stream / period, or one assessment. View-only.
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Crown, Medal, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
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

const initials = (name: string) =>
  (name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("") || "?").toUpperCase();

// Styled horizontal Top-3 podium shown above the board table ("top 3 under any leaderboard").
// Renders 2·1·3 with the champion centered and elevated; degrades gracefully with < 3 entries.
function Podium({ entries }: { entries: BoardEntry[] }) {
  const top = entries.slice(0, 3);
  if (top.length === 0) return null;
  const order = [top[1], top[0], top[2]].filter(Boolean) as BoardEntry[];
  const medal = (rank: number) => (rank === 1 ? Crown : rank <= 3 ? Medal : Trophy);
  const ring = (rank: number) =>
    rank === 1
      ? "ring-amber-400 bg-amber-400/10 text-amber-500"
      : rank === 2
        ? "ring-slate-300 bg-slate-300/10 text-slate-400"
        : "ring-orange-400 bg-orange-400/10 text-orange-500";
  return (
    <div className="rounded-2xl border bg-gradient-to-b from-primary/10 to-transparent p-3">
      <div className="mb-2 flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Trophy className="h-3.5 w-3.5" /> Top 3
      </div>
      <div className="flex items-end justify-center gap-2">
        {order.map((e) => {
          const Icon = medal(e.rank);
          return (
            <div key={e.student_id} className={cn("flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-xl border bg-background/70 px-2 text-center", e.rank === 1 ? "py-3" : "py-2")}>
              <div className={cn("relative flex items-center justify-center rounded-full ring-2", ring(e.rank), e.rank === 1 ? "h-12 w-12" : "h-10 w-10")}>
                <span className="text-sm font-semibold">{initials(e.name || "S")}</span>
                <Icon className="absolute -bottom-2 h-4 w-4 rounded-full bg-background p-0.5" />
              </div>
              <div className="w-full truncate text-xs font-medium">{e.name || "Student"}</div>
              <div className="text-[11px] font-semibold text-primary">{e.points} pts</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
      {board.data && <Podium entries={board.data.entries} />}
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
