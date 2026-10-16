import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Crown, Timer } from "lucide-react";
import { CardSkeleton, EmptyState, InlineError } from "@/academy/components/States";
import { cn } from "@/lib/utils";
import { assessmentLeaderboard, enc, type LeaderboardRow } from "./api";

const rankChip = (rank: number) =>
  rank === 1 ? "bg-yellow-100 text-yellow-800" : rank === 2 ? "bg-gray-200 text-gray-700" : rank === 3 ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground";

/** Per-assessment board: points, ties broken by duration (plan §5.5). */
export default function AssessmentLeaderboard() {
  const { id = "" } = useParams();
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setRows(null); setErr("");
    assessmentLeaderboard(id).then(setRows).catch(() => setErr("Could not load the leaderboard."));
  }, [id, tick]);

  const mins = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3 p-4 pb-24">
      <div>
        <h1 className="font-nunito text-2xl font-extrabold text-foreground">Leaderboard</h1>
        <p className="text-sm text-muted-foreground">Highest points first. Same score, fastest finish wins.</p>
      </div>
      {err && <InlineError message={err} onRetry={() => setTick((t) => t + 1)} />}
      {rows === null && !err && <div className="space-y-3"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>}
      {rows?.length === 0 && !err && (
        <EmptyState icon={<Crown className="h-6 w-6" />} title="No results yet" hint="The board fills as students finish this assessment." />
      )}
      <ol className="flex flex-col gap-2">
        {rows?.map((r) => (
          <li key={r.student_id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-sm font-extrabold", rankChip(r.rank))}>
              {r.rank}
            </span>
            {r.imgurl
              ? <img src={r.imgurl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{(r.name || "S").slice(0, 1).toUpperCase()}</span>}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-foreground">{r.name || `Student ${r.rank}`}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span>{r.correct}/{r.total} correct</span>
                <span className="inline-flex items-center gap-1"><Timer className="h-3.5 w-3.5" />{mins(r.duration_seconds)}</span>
                {r.is_late && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Late</span>}
              </p>
            </div>
            <span className="shrink-0 text-sm font-extrabold text-foreground">{r.points} pts</span>
          </li>
        ))}
      </ol>
      <Link className="text-center text-sm underline text-muted-foreground" to={`/assessment/${enc(id)}`}>Back to the assessment</Link>
    </div>
  );
}
