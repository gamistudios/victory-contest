// Live paywall preview: renders the plan the way a student sees it, updating as the admin types.
// Mirrors the server rule: the sale price applies only inside [starts_at, ends_at]; the server
// still recomputes every price. Whole ETB birr only.
import { Clock } from "lucide-react";
import { useCountdown } from "@/hooks/useCountdown";
import type { PricePlan } from "@/services/pricingServices";
import { etbPrice, saleProblem, saleState } from "./SaleFields";

const birr = (n: number) => `${Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 })} ETB`;
const two = (n: number) => String(n).padStart(2, "0");

function validityText(p: PricePlan): string {
  if (p.validity.type === "lifetime") return "Lifetime access";
  if (p.validity.type === "fixed_end") return p.validity.ends_at ? `Access until ${new Date(p.validity.ends_at).toLocaleDateString()}` : "Fixed end date (not set)";
  const d = p.validity.days ?? 0;
  return `${d} day${d === 1 ? "" : "s"} of access`;
}

export default function PaywallPreview({ plan, programName }: { plan: PricePlan; programName: (id: string) => string }) {
  const state = saleState(plan);
  const valid = !saleProblem(plan);
  const live = state === "live" && valid;
  const scheduled = state === "scheduled" && valid;
  // useCountdown re-renders every second; an empty target yields zeros.
  const t = useCountdown(live ? plan.sale!.ends_at : scheduled ? plan.sale!.starts_at : "");

  const base = etbPrice(plan.prices);
  const price = live ? etbPrice(plan.sale!.prices) : base;
  const list = etbPrice(plan.list_prices);
  const strike = live ? Math.max(base, list) : list > base ? list : 0;
  const highlights = (plan.highlights ?? []).map((h) => h.trim()).filter(Boolean);
  const clock = `${t.days > 0 ? `${t.days}d ` : ""}${two(t.hours)}:${two(t.minutes)}:${two(t.seconds)}`;

  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-3" aria-label="Paywall preview">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Student preview</p>
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <p className="font-nunito-sans text-lg font-extrabold text-foreground">{plan.name || "Untitled plan"}</p>
          {plan.badge && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">{plan.badge}</span>}
        </div>
        {plan.description && <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>}

        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-nunito-sans text-3xl font-extrabold text-foreground">{birr(price)}</span>
          {strike > price && <span className="text-sm text-muted-foreground line-through">{birr(strike)}</span>}
        </div>
        <p className="text-xs text-muted-foreground">{validityText(plan)}</p>

        {(live || scheduled) && (
          <p className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${live ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700"}`}>
            <Clock className="h-3.5 w-3.5" aria-hidden /> {live ? "Sale ends in" : "Sale starts in"} {clock}
          </p>
        )}
        {state === "scheduled" && !live && !scheduled && <p className="mt-2 text-xs text-red-600">Fix the sale window to preview it.</p>}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {plan.all_programs ? <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">All programs</span>
            : (plan.program_ids ?? []).map((id) => <span key={id} className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{programName(id)}</span>)}
        </div>
        {highlights.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-foreground">
            {highlights.map((h, i) => <li key={`${i}-${h}`} className="flex gap-2"><span aria-hidden>✓</span><span>{h}</span></li>)}
          </ul>
        )}
        <button type="button" disabled className="mt-4 h-11 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground opacity-80">Unlock now</button>
      </div>
      {!plan.is_active && <p className="mt-2 text-xs text-muted-foreground">This plan is inactive, so students will not see it.</p>}
    </div>
  );
}
