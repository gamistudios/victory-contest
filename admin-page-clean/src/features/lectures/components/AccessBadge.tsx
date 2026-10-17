import { CheckCircle, Lock, Star } from "lucide-react";
import type { Access } from "@/types/academy";
import { cn } from "@/lib/utils";

/** Same Free / Premium pill language as victory-contest's ContestCard. */
export function AccessBadge({ access, locked, compact, className }: { access: Access; locked?: boolean; compact?: boolean; className?: string }) {
  if (access === "free") {
    return (
      <span className={cn("inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800", className)}>
        <CheckCircle className="mr-1 h-3.5 w-3.5 fill-current text-green-600" aria-hidden />
        {!compact && "Free"}
        {compact && <span className="sr-only">Free</span>}
      </span>
    );
  }
  const Icon = locked ? Lock : Star;
  return (
    <span className={cn("inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-semibold text-yellow-800", className)}>
      <Icon className={cn("mr-1 h-3.5 w-3.5 text-yellow-600", !locked && "fill-current")} aria-hidden />
      {!compact ? "Premium" : <span className="sr-only">Premium</span>}
    </span>
  );
}
