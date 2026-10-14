import { useEffect, useRef, useState } from "react";
import { Check, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listPlans, quotePlan, type PricePlan, type Quote } from "./api";

// All money is whole ETB birr (server-priced integers; no sub-units).
const birr = (etbAmount: number) => etbAmount.toLocaleString(undefined, { maximumFractionDigits: 0 });
const etb = (p: PricePlan) => p.sale?.prices.find((m) => m.currency === "ETB")?.amount ?? p.prices.find((m) => m.currency === "ETB")?.amount ?? 0;
const validityLabel = (p: PricePlan) =>
  p.validity.type === "lifetime" ? "Lifetime" : p.validity.type === "days" ? `${p.validity.days} days` : p.validity.ends_at ? `Until ${new Date(p.validity.ends_at).toLocaleDateString()}` : "";

/**
 * Plan list + coupon field, used by the premium sheet and the payment page.
 * The server quote is the only price shown as final.
 */
export default function PlanPicker({ programId, initialPlanId, initialCoupon, onSelect }: {
  programId?: string;
  initialPlanId?: string;
  initialCoupon?: string;
  onSelect: (planId: string, quote: Quote, couponCode: string) => void;
}) {
  const [plans, setPlans] = useState<PricePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [planId, setPlanId] = useState("");
  const [coupon, setCoupon] = useState(initialCoupon ?? "");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [err, setErr] = useState("");
  const [couponErr, setCouponErr] = useState("");
  const booted = useRef(false);

  const price = async (id: string, code: string) => {
    setErr("");
    setCouponErr("");
    try {
      const q = await quotePlan(id, "ETB", code);
      setQuote(q);
      onSelect(id, q, code);
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? "Could not price this plan";
      setQuote(null);
      // A bad coupon should not deselect the plan: re-quote without it.
      if (code) {
        setCouponErr(msg);
        try { const q = await quotePlan(id, "ETB", ""); setQuote(q); onSelect(id, q, ""); } catch { /* keep error */ }
      } else setErr(msg);
    }
  };

  useEffect(() => {
    setLoading(true);
    listPlans(programId)
      .then((p) => {
        setPlans(p);
        const start = initialPlanId && p.some((x) => x.id === initialPlanId) ? initialPlanId : "";
        if (start && !booted.current) { booted.current = true; setPlanId(start); void price(start, initialCoupon ?? ""); }
      })
      .catch(() => setErr("Could not load plans"))
      .finally(() => setLoading(false));
  }, [programId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="space-y-2" aria-busy="true">{[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}</div>;

  return (
    <div className="space-y-3">
      <ul className="space-y-2" role="radiogroup" aria-label="Plans">
        {plans.map((p) => {
          const active = planId === p.id;
          const list = p.list_prices.find((m) => m.currency === "ETB")?.amount ?? 0;
          return (
            <li key={p.id}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => { setPlanId(p.id); void price(p.id, coupon); }}
                className={cn(
                  "w-full rounded-2xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "border-blue-fix-600 bg-blue-100" : "border-border bg-card hover:bg-muted/50",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-extrabold">
                      {p.name}
                      {p.badge && <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-bold uppercase text-yellow-700">{p.badge}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{[validityLabel(p), p.description].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {list > etb(p) && <p className="text-[11px] text-muted-foreground line-through">{birr(list)}</p>}
                    <p className="text-sm font-extrabold">{birr(etb(p))} <span className="text-[11px] font-semibold text-muted-foreground">ETB</span></p>
                  </div>
                </div>
                {active && <Check className="sr-only" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
      {plans.length === 0 && !err && <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No plans are available yet.</p>}

      {planId && (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Coupon code" aria-label="Coupon code" aria-invalid={!!couponErr} className="h-11 pl-9" />
            </div>
            <Button type="button" variant="outline" className="h-11" onClick={() => price(planId, coupon)}>Apply</Button>
          </div>
          {couponErr && <p className="text-xs font-medium text-red-700" role="alert">{couponErr}</p>}
        </div>
      )}
      {quote && (
        <p className="flex items-baseline justify-between rounded-2xl bg-muted px-3 py-2.5 text-sm" aria-live="polite">
          <span className="text-muted-foreground">{quote.discount > 0 ? `Coupon saves ${birr(quote.discount)} ETB` : "You pay"}</span>
          <span className="font-extrabold">{quote.free ? "Free" : `${birr(quote.final)} ETB`}</span>
        </p>
      )}
      {err && <p className="text-sm font-medium text-red-700" role="alert">{err}</p>}
    </div>
  );
}
