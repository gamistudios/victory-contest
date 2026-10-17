// One leaderboard view (plan §5.5 / Phase 3): Today · Week · Month · All Time, program switcher,
// stream chips limited to the student's own stream, "my rank" pinned (correct beyond the top 100),
// "late" tag on penalised rows. Used as the page; also usable inside a modal.
import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState, InlineError } from "@/features/learn/components/States";
import { getBoard, getBoardPrograms, type BoardEntry, type BoardPrograms, type BoardView, type Period } from "./api";

const PERIODS: { id: Period; label: string }[] = [
  { id: "day", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "all", label: "All Time" },
];

const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${s % 60}s`;
};

function Row({ e, mine }: { e: BoardEntry; mine?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border px-3 py-2", mine && "border-primary bg-primary/5")}>
      <div className="w-8 text-center font-semibold">{e.rank <= 3 ? <Trophy className="mx-auto h-4 w-4" /> : e.rank}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{e.name || "Student"}{mine ? " (you)" : ""}</div>
        <div className="text-xs text-muted-foreground">
          {e.attempts} attempt{e.attempts === 1 ? "" : "s"} · avg {e.avg_percent}% · {fmtTime(e.seconds)}
          {e.late && <span className="ml-2 rounded bg-amber-100 px-1 text-amber-700">late −penalty</span>}
        </div>
      </div>
      <div className="text-right text-sm font-semibold">{e.points} pts</div>
    </div>
  );
}

export default function LeaderboardView() {
  const [period, setPeriod] = useState<Period>("week");
  const [programs, setPrograms] = useState<BoardPrograms | null>(null);
  const [program, setProgram] = useState<string>("");
  const [stream, setStream] = useState<string>("");
  const [board, setBoard] = useState<BoardView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBoardPrograms()
      .then((p) => { setPrograms(p); setProgram(p.primary_program_id || p.enrollments[0]?.program_id || ""); })
      .catch(() => setError("Could not load your programs."));
  }, []);

  const load = () => {
    if (!program) return;
    setLoading(true); setError(null);
    getBoard(period, program, stream || undefined)
      .then(setBoard)
      .catch(() => setError("Could not load the leaderboard."))
      .finally(() => setLoading(false));
  };
  useEffect(load, [period, program, stream]); // eslint-disable-line react-hooks/exhaustive-deps

  const enrol = programs?.enrollments.find((e) => e.program_id === program);
  const ownStream = enrol?.stream_id && enrol.stream_id !== "common" ? enrol.stream_id : "";
  const meInList = board?.me && board.entries.some((e) => e.student_id === board.me!.student_id);

  return (
    <div className="mx-auto max-w-xl space-y-3 p-4 pb-24">
      <h1 className="text-lg font-semibold">Leaderboard</h1>
      <div className="flex gap-1 rounded-xl bg-muted p-1">
        {PERIODS.map((p) => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={cn("flex-1 rounded-lg py-1.5 text-sm", period === p.id ? "bg-background font-semibold shadow" : "text-muted-foreground")}>
            {p.label}
          </button>
        ))}
      </div>
      {programs && programs.enrollments.length > 1 && (
        <select className="w-full rounded-lg border bg-background p-2 text-sm" value={program}
          onChange={(e) => { setProgram(e.target.value); setStream(""); }}>
          {programs.enrollments.map((e) => <option key={e.program_id} value={e.program_id}>{e.program_id}</option>)}
        </select>
      )}
      {ownStream && (
        <div className="flex gap-2">
          {[{ id: "", label: "Whole program" }, { id: ownStream, label: ownStream }].map((c) => (
            <button key={c.id || "all"} onClick={() => setStream(c.id)}
              className={cn("rounded-full border px-3 py-1 text-xs", stream === c.id && "border-primary bg-primary/10 font-semibold")}>
              {c.label}
            </button>
          ))}
        </div>
      )}
      {error && <InlineError message={error} onRetry={load} />}
      {!error && loading && <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>}
      {!error && !loading && board && board.entries.length === 0 && (
        <EmptyState title="No ranks yet" hint="Finish an assessment to appear on this board." />
      )}
      {!error && !loading && board && board.entries.length > 0 && (
        <div className="space-y-2">
          {board.entries.map((e) => <Row key={e.student_id} e={e} mine={e.student_id === board.me?.student_id} />)}
          {board.me && !meInList && (
            <div className="sticky bottom-20 pt-2"><Row e={board.me} mine /></div>
          )}
        </div>
      )}
    </div>
  );
}
