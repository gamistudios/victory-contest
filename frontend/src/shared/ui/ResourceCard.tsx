// One card for every learnable/attemptable thing (plan 6.1): title, optional scope badge,
// access badge, lock state and a meta line. Contest rows, Academy subjects and the Home
// "Keep learning" strip all render through it.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export type ResourceAccess = "free" | "mixed" | "premium";

export function ScopeBadge({ label, className }: { label?: string | null; className?: string }) {
  if (!label) return null;
  return <span className={cn("inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800", className)}>{label}</span>;
}

export function AccessPill({ access, locked }: { access?: ResourceAccess; locked?: boolean }) {
  if (!access || access === "free") return null;
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-semibold text-yellow-800">
      {locked && <Lock className="h-3 w-3" aria-hidden />}
      {access === "premium" ? "Premium" : "Some premium"}
    </span>
  );
}

interface Props {
  title: string;
  to?: string;
  onClick?: () => void;
  scope?: string | null;
  access?: ResourceAccess;
  locked?: boolean;
  meta?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}

export function ResourceCard({ title, to, onClick, scope, access, locked, meta, leading, trailing, className }: Props) {
  const body = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">{title}</p>
        {meta && <p className="mt-1 text-xs text-muted-foreground">{meta}</p>}
        {(scope || (access && access !== "free")) && (
          <div className="mt-2 flex flex-wrap gap-1">
            <ScopeBadge label={scope} />
            <AccessPill access={access} locked={locked} />
          </div>
        )}
      </div>
      {trailing}
    </>
  );
  const cls = cn("flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition active:scale-[0.99]", className);
  if (to) return <Link to={to} className={cls}>{body}</Link>;
  return <button type="button" onClick={onClick} className={cn(cls, "w-full text-left")}>{body}</button>;
}
