import { useEffect, useState } from "react";

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(r)}` : `${p(m)}:${p(r)}`;
};

/** Countdown to `endsAt` using the server clock; calls onExpire once at zero. */
export default function Timer({ endsAt, now, onExpire }: { endsAt: string; now: () => number; onExpire: () => void }) {
  const end = Date.parse(endsAt);
  const [left, setLeft] = useState(() => end - now());
  useEffect(() => {
    let fired = false;
    const id = setInterval(() => {
      const l = end - now();
      setLeft(l);
      if (l <= 0 && !fired) { fired = true; onExpire(); }
    }, 500);
    return () => clearInterval(id);
  }, [end, now, onExpire]);
  return <span className={`font-mono text-sm font-semibold ${left < 60_000 ? "text-red-600" : ""}`} aria-live="off">{fmt(left)}</span>;
}
export { fmt as formatCountdown };
