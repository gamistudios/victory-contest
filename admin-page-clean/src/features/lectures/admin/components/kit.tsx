import { useEffect, useState, type ReactNode } from "react";
import { Archive, CheckCircle2, Clock, FilePen, Minus, Plus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { PublishStatus } from "@/types/academy";

export const ADMIN_BASE = "/dashboard/programs/academy";

/** Fired after anything that changes the AI-draft queue so the layout badge refreshes. */
export const DRAFTS_EVENT = "academy-admin:drafts-changed";
export const notifyDraftsChanged = () => window.dispatchEvent(new Event(DRAFTS_EVENT));

export const errMsg = (e: unknown): string =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? (e instanceof Error ? e.message : "Something went wrong");

export function useIsDesktop(): boolean {
  const q = "(min-width: 1024px)";
  const [v, setV] = useState(() => (typeof window !== "undefined" ? window.matchMedia(q).matches : false));
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setV(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return v;
}

export const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`;

/* ------------------------------ layout bits ------------------------------ */

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-2xl border border-border bg-card p-4", className)}>{children}</section>;
}

export function PanelTitle({ icon: Icon, children, action }: { icon?: LucideIcon; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex min-h-[28px] items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 font-nunito-sans text-base font-bold text-foreground">
        {Icon && <Icon className="h-5 w-5 text-brand-ink" aria-hidden />}
        {children}
      </h2>
      {action}
    </div>
  );
}

export function PageTitle({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-nunito-sans text-xl font-extrabold text-foreground lg:text-2xl">{title}</h1>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function Field({ label, htmlFor, error, hint, children, className }: { label: string; htmlFor?: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Text-field styling matching shadcn <Input/> but 44px tall for touch. */
export const inputCls = "h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm";
export const areaCls = "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm";

/* ------------------------------ controls ------------------------------ */

export interface SegOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

export function Segmented<T extends string>({ value, onChange, options, label, className, compact }: { value: T; onChange: (v: T) => void; options: SegOption<T>[]; label: string; className?: string; compact?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex w-full gap-1 rounded-xl bg-muted p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              compact && "min-h-10 text-xs",
              active ? "bg-card font-bold text-foreground shadow-sm" : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ active, onClick, children, icon: Icon, className }: { active?: boolean; onClick?: () => void; children: ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={!!active}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-transparent bg-blue-fix-600 text-white" : "border-border bg-card text-foreground hover:bg-muted",
        className,
      )}
    >
      {Icon && <Icon className="h-4 w-4" aria-hidden />}
      {children}
    </button>
  );
}

export function IconBtn({ label, icon: Icon, onClick, className, disabled, tone = "muted", type = "button" }: { label: string; icon: LucideIcon; onClick?: () => void; className?: string; disabled?: boolean; tone?: "muted" | "danger" | "ghost"; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
        tone === "muted" && "bg-muted text-foreground hover:bg-secondary",
        tone === "ghost" && "text-muted-foreground hover:bg-muted hover:text-foreground",
        tone === "danger" && "bg-destructive/10 text-destructive hover:bg-destructive/20",
        className,
      )}
    >
      <Icon className="h-5 w-5" aria-hidden />
    </button>
  );
}

export function Stepper({ value, onChange, min = 0, max = 999, step = 1, label, suffix }: { value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; label: string; suffix?: string }) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div role="group" aria-label={label} className="inline-flex items-center gap-1 rounded-xl bg-muted p-1">
      <button type="button" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - step))} className="flex h-11 w-11 items-center justify-center rounded-lg bg-card text-foreground shadow-sm active:scale-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <output aria-live="polite" className="min-w-[4rem] px-2 text-center text-sm font-bold text-foreground">
        {value}
        {suffix && <span className="ml-0.5 text-xs font-medium text-muted-foreground">{suffix}</span>}
      </output>
      <button type="button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(clamp(value + step))} className="flex h-11 w-11 items-center justify-center rounded-lg bg-card text-foreground shadow-sm active:scale-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

const STATUS: Record<PublishStatus, { label: string; cls: string; icon: LucideIcon }> = {
  published: { label: "Published", cls: "bg-green-100 text-green-800", icon: CheckCircle2 },
  draft: { label: "Draft", cls: "bg-muted text-muted-foreground", icon: FilePen },
  scheduled: { label: "Scheduled", cls: "bg-blue-100 text-blue-700", icon: Clock },
  archived: { label: "Archived", cls: "bg-orange-100 text-orange-700", icon: Archive },
};
export const STATUS_OPTIONS: SegOption<PublishStatus>[] = (Object.keys(STATUS) as PublishStatus[]).map((k) => ({ value: k, label: STATUS[k].label, icon: STATUS[k].icon }));

export function StatusPill({ status, className }: { status: PublishStatus; className?: string }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", s.cls, className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {s.label}
    </span>
  );
}

/* ------------------------------ overlays ------------------------------ */

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Delete", cancelLabel = "Cancel", destructive = true, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean; onConfirm: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="w-[calc(100%-2rem)] rounded-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            className="h-11"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
                onOpenChange(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Bottom sheet used for every edit form (mobile first; centred + capped on desktop). */
export function FormSheet({ open, onOpenChange, title, description, children, footer, tall }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; tall?: boolean }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className={cn("mx-auto max-w-2xl", tall ? "h-[92dvh]" : "max-h-[92dvh]")}>
        <DrawerHeader className="pb-2 text-left">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription className={description ? undefined : "sr-only"}>{description ?? title}</DrawerDescription>
        </DrawerHeader>
        <div data-vaul-no-drag className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {children}
        </div>
        {footer && <div className="flex gap-2 border-t border-border bg-card p-4 pb-safe">{footer}</div>}
      </DrawerContent>
    </Drawer>
  );
}

export function StatTile({ icon: Icon, label, value, tone = "bg-blue-100 text-blue-700", sub }: { icon: LucideIcon; label: string; value: ReactNode; tone?: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5">
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", tone)}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-muted-foreground">{label}</p>
        <p className="font-nunito-sans text-xl font-extrabold leading-tight text-foreground">{value}</p>
        {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}
