// One leaderboard view (plan §5.5 / Phase 3): Today · Week · Month · All Time, program switcher,
// stream chips limited to the student's own stream, "my rank" pinned (correct beyond the top 100),
// "late" tag on penalised rows. Used as the page; also usable inside a modal.
import { useEffect, useState } from "react";
import { Crown, Medal, Trophy } from "lucide-react";
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
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${s % 60}s`
};

const initials = (name: string) =>
  (name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("") || "?").toUpperCase();

// Styled horizontal Top-3 podium shown above the full board ("top 3 under any leaderboard").
// Renders 2·1·3 with the champion centered and elevated; degrades gracefully when the board
// has fewer than three entries.
function Podium({ entries, meId }: { entries: BoardEntry[]; meId?: string }) {
  const top = entries.slice(0, 3);
  if (top.length === 0) return null;
  // Visual order: runner-up, champion, third. Missing slots are simply omitted.
  const order = [top[1], top[0], top[2]].filter(Boolean) as BoardEntry[];

  const medal = (rank: number) =>
    rank === 1 ? Crown : rank === 2 ? Medal : rank === 3 ? Medal : Trophy;

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
          const mine = e.student_id === meId;
          return (
            <div
              key={e.student_id}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-xl border bg-background/70 px-2 text-center",
                e.rank === 1 ? "py-3" : "py-2",
                mine && "border-primary",
              )}
            >
              <div className={cn("relative flex items-center justify-center rounded-full ring-2", ring(e.rank), e.rank === 1 ? "h-12 w-12" : "h-10 w-10")}>
                {e.avatar_url ? (
                  <img src={e.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <span className="text-sm font-semibold">{initials(e.name || "S")}</span>
                )}
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
          <Podium entries={board.entries} meId={board.me?.student_id} />
          {board.entries.map((e) => <Row key={e.student_id} e={e} mine={e.student_id === board.me?.student_id} />)}
          {board.me && !meInList && (
            <div className="sticky bottom-20 pt-2"><Row e={board.me} mine /></div>
          )}
        </div>
      )}
    </div>
  );
}
