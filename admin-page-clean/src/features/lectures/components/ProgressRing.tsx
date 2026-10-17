import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: number; // 0-100
  size?: number;
  stroke?: number;
  /** Tailwind stroke-* class for the arc (use a tone's `stroke`). */
  arcClass?: string;
  trackClass?: string;
  children?: ReactNode;
  className?: string;
  label?: string;
}

/** Circular progress used for subjects, module header and score results. */
export function ProgressRing({ value, size = 44, stroke = 5, arcClass = "stroke-brand", trackClass = "stroke-muted", children, className, label }: Props) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Progress"}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={trackClass} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * v) / 100}
          className={cn("transition-[stroke-dashoffset] duration-700 ease-out", arcClass)}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-foreground">{children ?? `${Math.round(v)}%`}</div>
    </div>
  );
}

export function ProgressBar({ value, className, barClass = "bg-brand" }: { value: number; className?: string; barClass?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", barClass)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
