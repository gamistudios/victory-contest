// Sale-window fields for the plan editor (plan §5.12): sale price + start/end, plus an optional
// strike-through list price. All money is whole ETB birr. The server re-validates and recomputes.
import { Switch } from "@/components/ui/switch";
import { Field, inputCls } from "@/features/lectures/admin/components/kit";
import type { Money, PricePlan } from "@/services/pricingServices";
import { fromLocalInput, toLocalInput } from "./dates";

export const etbPrice = (list: Money[] | undefined): number => list?.find((m) => m.currency === "ETB")?.amount ?? 0;
const withEtb = (list: Money[] | undefined, amount: number): Money[] => [{ currency: "ETB", amount }, ...(list ?? []).filter((m) => m.currency !== "ETB")];

/** "" when the plan's sale (if any) is valid; otherwise a message for the admin. */
export function saleProblem(plan: PricePlan): string {
  const s = plan.sale;
  if (!s) return "";
  const sale = etbPrice(s.prices);
  const base = etbPrice(plan.prices);
  if (!Number.isInteger(sale) || sale < 0) return "Sale price must be a whole number of birr (0 or more).";
  if (sale >= base) return "Sale price must be lower than the normal price.";
  const a = Date.parse(s.starts_at), b = Date.parse(s.ends_at);
  if (Number.isNaN(a) || Number.isNaN(b)) return "Set both the sale start and the sale end.";
  if (a >= b) return "The sale must end after it starts.";
  return "";
}

export type SaleState = "off" | "scheduled" | "live" | "ended";
export function saleState(plan: PricePlan, now = Date.now()): SaleState {
  const s = plan.sale;
  if (!s) return "off";
  const a = Date.parse(s.starts_at), b = Date.parse(s.ends_at);
  if (Number.isNaN(a) || Number.isNaN(b)) return "off";
  return now < a ? "scheduled" : now > b ? "ended" : "live";
}

const BADGE: Record<SaleState, { text: string; cls: string }> = {
  off: { text: "", cls: "" },
  scheduled: { text: "Scheduled", cls: "bg-blue-100 text-blue-700" },
  live: { text: "Live now", cls: "bg-emerald-100 text-emerald-700" },
  ended: { text: "Ended", cls: "bg-muted text-muted-foreground" },
};

export default function SaleFields({ plan, onChange }: { plan: PricePlan; onChange: (p: PricePlan) => void }) {
  const on = !!plan.sale;
  const state = saleState(plan);
  const problem = saleProblem(plan);
  const base = etbPrice(plan.prices);

  const enable = (v: boolean) => {
    if (!v) { onChange({ ...plan, sale: undefined }); return; }
    const start = new Date();
    const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000);
    onChange({ ...plan, sale: { prices: [{ currency: "ETB", amount: Math.max(0, Math.round(base * 0.8)) }], starts_at: start.toISOString(), ends_at: end.toISOString() } });
  };

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Switch checked={on} onCheckedChange={enable} aria-label="Run a sale" /> Sale window
        </div>
        {on && state !== "off" && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${BADGE[state].cls}`}>{BADGE[state].text}</span>}
      </div>

      {on && plan.sale && (
        <div className="space-y-3">
          <Field label="Sale price (ETB)" hint={`Normal price is ${base.toLocaleString()} ETB. Whole birr only.`}>
            <input className={inputCls} type="number" min={0} step={1} value={etbPrice(plan.sale.prices)}
              onChange={(e) => onChange({ ...plan, sale: { ...plan.sale!, prices: withEtb(plan.sale!.prices, Math.round(Number(e.target.value))) } })} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Starts"><input className={inputCls} type="datetime-local" value={toLocalInput(plan.sale.starts_at)} onChange={(e) => onChange({ ...plan, sale: { ...plan.sale!, starts_at: fromLocalInput(e.target.value) } })} /></Field>
            <Field label="Ends"><input className={inputCls} type="datetime-local" value={toLocalInput(plan.sale.ends_at)} onChange={(e) => onChange({ ...plan, sale: { ...plan.sale!, ends_at: fromLocalInput(e.target.value) } })} /></Field>
          </div>
          {problem && <p className="text-sm text-red-600" role="alert">{problem}</p>}
        </div>
      )}

      <Field label="List price (ETB, optional)" hint="Shown struck through next to the price when higher. 0 = none.">
        <input className={inputCls} type="number" min={0} step={1} value={etbPrice(plan.list_prices)}
          onChange={(e) => {
            const n = Math.max(0, Math.round(Number(e.target.value)));
            onChange({ ...plan, list_prices: n > 0 ? withEtb(plan.list_prices, n) : (plan.list_prices ?? []).filter((m) => m.currency !== "ETB") });
          }} />
      </Field>
    </div>
  );
}
