import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export function BackButton({ to, className }: { to?: string; className?: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      aria-label="Go back"
      onClick={() => (to ? navigate(to) : navigate(-1))}
      className={cn("inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground transition active:scale-95", className)}
    >
      <ChevronLeft className="h-5 w-5" />
    </button>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="font-nunito-sans text-lg font-bold text-foreground">{children}</h2>
      {action}
    </div>
  );
}
