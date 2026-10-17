// Score distribution: ten 10-point bands (the last includes 100). Pure CSS bars - no chart lib.
import type { DistributionBin } from "./api";

export default function ScoreDistribution({ bins }: { bins: DistributionBin[] }) {
  const max = Math.max(1, ...bins.map((b) => b.count));
  const total = bins.reduce((s, b) => s + b.count, 0);
  if (total === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No finished attempts in this scope.</p>;
  return (
    <div>
      <div className="flex h-48 items-end gap-1.5" role="img" aria-label={`Score distribution of ${total} attempts`}>
        {bins.map((b) => {
          const pct = (b.count / max) * 100;
          return (
            <div key={b.from} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[11px] font-semibold text-foreground">{b.count}</span>
              <div
                className="w-full rounded-t-md bg-primary/80"
                style={{ height: `${pct}%`, minHeight: b.count > 0 ? 4 : 0 }}
                title={`${b.from}–${b.to}%: ${b.count} attempts (${Math.round((b.count / total) * 100)}%)`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5">
        {bins.map((b) => (
          <span key={b.from} className="min-w-0 flex-1 truncate text-center text-[10px] text-muted-foreground">{b.from}–{b.to}</span>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Score band in % · {total} finished attempts</p>
    </div>
  );
}
