import { useCallback, useEffect, useState } from "react";
import { KeyRound, Pencil, Plus, Tag, Ticket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip, ConfirmDialog, Field, FormSheet, IconBtn, PageTitle, Panel, Segmented, errMsg, inputCls } from "@/features/lectures/admin/components/kit";
import { getAdminCatalog } from "@/services/catalogServices";
import type { Program } from "@/types/academy";
import * as svc from "@/services/pricingServices";
import GrantAccessDialog from "@/features/pricing/GrantAccessDialog";
import PaywallPreview from "@/features/pricing/PaywallPreview";
import SaleFields, { saleProblem, saleState } from "@/features/pricing/SaleFields";
import { fromLocalInput, toLocalInput } from "@/features/pricing/dates";

const emptyPlan = (): svc.PricePlan => ({
  name: "", description: "", program_ids: [], all_programs: false,
  validity: { type: "days", days: 30 }, prices: [{ currency: "ETB", amount: 0 }], list_prices: [],
  highlights: [], badge: "", is_active: true, visible_from: "", visible_until: "", sort_order: 0,
});
const emptyCoupon = (): svc.Coupon => ({
  code: "", kind: "percent", value: 10, plan_ids: [], program_ids: [],
  max_redemptions: 0, per_student_limit: 1, starts_at: "", ends_at: "", is_active: true,
});
// All money is whole ETB birr (integers; no sub-units).
const birr = (etbAmount: number) => etbAmount.toLocaleString(undefined, { maximumFractionDigits: 0 });
const toggle = <T,>(l: T[], v: T) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);
const etbOf = (p: svc.PricePlan) => p.prices.find((m) => m.currency === "ETB")?.amount ?? 0;

export default function Pricing() {
  const [tab, setTab] = useState<"plans" | "coupons">("plans");
  const [plans, setPlans] = useState<svc.PricePlan[] | null>(null);
  const [coupons, setCoupons] = useState<svc.Coupon[] | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [plan, setPlan] = useState<svc.PricePlan | null>(null);
  const [coupon, setCoupon] = useState<svc.Coupon | null>(null);
  const [del, setDel] = useState<{ kind: "plan" | "coupon"; id: string; label: string } | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setPlans(await svc.listPlans());
      setCoupons(await svc.listCoupons());
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, []);
  useEffect(() => {
    void load();
    getAdminCatalog().then((c) => setPrograms(c.programs ?? [])).catch(() => undefined);
  }, [load]);

  const progName = (id: string) => programs.find((p) => p.id === id)?.name ?? id;

  const savePlan = async () => {
    if (!plan) return;
    const problem = saleProblem(plan);
    if (problem) { toast.error(problem); return; }
    try {
      await svc.savePlan({ ...plan, highlights: (plan.highlights ?? []).map((h) => h.trim()).filter(Boolean) });
      setPlan(null);
      toast.success("Plan saved");
      await load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const saveCoupon = async () => {
    if (!coupon) return;
    try {
      await svc.saveCoupon(coupon);
      setCoupon(null);
      toast.success("Coupon saved");
      await load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4">
      <PageTitle
        title="Pricing & coupons"
        hint="Plans decide which programs a payment unlocks and for how long. The server recomputes every price."
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" className="h-11 gap-1.5 rounded-xl" onClick={() => setGrantOpen(true)}>
              <KeyRound className="h-4 w-4" aria-hidden /> Grant / revoke
            </Button>
            <Button className="h-11 gap-1.5 rounded-xl" onClick={() => (tab === "plans" ? setPlan(emptyPlan()) : setCoupon(emptyCoupon()))}>
              <Plus className="h-4 w-4" aria-hidden /> {tab === "plans" ? "New plan" : "New coupon"}
            </Button>
          </div>
        }
      />
      <Segmented label="Pricing view" value={tab} onChange={setTab} options={[{ value: "plans", label: "Plans", icon: Tag }, { value: "coupons", label: "Coupons", icon: Ticket }]} />

      {tab === "plans" ? (
        !plans ? <Skeleton className="h-32 w-full rounded-2xl" /> :
        plans.length === 0 ? <Panel><p className="text-sm text-muted-foreground">No plans yet. Create one so students can pay.</p></Panel> :
        plans.map((p) => (
          <Panel key={p.id} className={p.is_active ? "" : "opacity-70"}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-nunito-sans text-base font-bold text-foreground">
                  {p.name} {p.badge && <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">{p.badge}</span>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {birr(etbOf(p))} ETB{saleState(p) === "live" && <span className="ml-1.5 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">sale {birr(p.sale?.prices.find((m) => m.currency === "ETB")?.amount ?? 0)} ETB</span>}{saleState(p) === "scheduled" && <span className="ml-1.5 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">sale scheduled</span>} · {p.validity.type === "days" ? `${p.validity.days} days` : p.validity.type === "lifetime" ? "lifetime" : "fixed end"} {!p.is_active && "· inactive"}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.all_programs ? <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">All programs</span> :
                    p.program_ids.map((id) => <span key={id} className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{progName(id)}</span>)}
                </div>
              </div>
              <div className="flex gap-2">
                <IconBtn label="Edit plan" icon={Pencil} onClick={() => setPlan(p)} />
                <IconBtn label="Delete plan" icon={Trash2} tone="danger" onClick={() => setDel({ kind: "plan", id: p.id!, label: p.name })} />
              </div>
            </div>
          </Panel>
        ))
      ) : !coupons ? <Skeleton className="h-32 w-full rounded-2xl" /> :
        coupons.length === 0 ? <Panel><p className="text-sm text-muted-foreground">No coupons yet.</p></Panel> :
        coupons.map((c) => (
          <Panel key={c.id} className={c.is_active ? "" : "opacity-70"}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-nunito-sans text-base font-bold tracking-wide text-foreground">{c.code}</p>
                <p className="text-sm text-muted-foreground">
                  {c.kind === "percent" ? `${c.value}% off` : `${birr(c.value)} ETB off`} · used {c.redeemed ?? 0}/{c.max_redemptions || "∞"} · {c.per_student_limit || "∞"} per student
                </p>
              </div>
              <div className="flex gap-2">
                <IconBtn label="Edit coupon" icon={Pencil} onClick={() => setCoupon(c)} />
                <IconBtn label="Delete coupon" icon={Trash2} tone="danger" onClick={() => setDel({ kind: "coupon", id: c.id!, label: c.code })} />
              </div>
            </div>
          </Panel>
        ))}

      <FormSheet
        open={!!plan}
        onOpenChange={(o) => !o && setPlan(null)}
        title={plan?.id ? "Edit plan" : "New plan"}
        tall
        footer={<><Button variant="secondary" className="h-11 flex-1 rounded-xl" onClick={() => setPlan(null)}>Cancel</Button><Button className="h-11 flex-1 rounded-xl" onClick={savePlan}>Save plan</Button></>}
      >
        {plan && (
          <div className="space-y-4">
            <Field label="Name"><input className={inputCls} value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} placeholder="e.g. Grade 12 monthly" /></Field>
            <Field label="Unlocks" hint="All programs also covers programs added later.">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Switch checked={plan.all_programs} onCheckedChange={(v) => setPlan({ ...plan, all_programs: v })} /> All programs</div>
              {!plan.all_programs && (
                <div className="flex flex-wrap gap-2">
                  {programs.map((p) => <Chip key={p.id} active={plan.program_ids.includes(p.id)} onClick={() => setPlan({ ...plan, program_ids: toggle(plan.program_ids, p.id) })}>{p.name}</Chip>)}
                </div>
              )}
            </Field>
            <Field label="Price (ETB)">
              <input className={inputCls} type="number" min={0} step={1} value={etbOf(plan)}
                onChange={(e) => setPlan({ ...plan, prices: [{ currency: "ETB", amount: Math.round(Number(e.target.value)) }, ...plan.prices.filter((m) => m.currency !== "ETB")] })} />
            </Field>
            <Field label="Validity">
              <Segmented label="Validity" value={plan.validity.type} onChange={(v) => setPlan({ ...plan, validity: v === "days" ? { type: "days", days: 30 } : v === "lifetime" ? { type: "lifetime" } : { type: "fixed_end", ends_at: "" } })}
                options={[{ value: "days", label: "Days" }, { value: "fixed_end", label: "Fixed end" }, { value: "lifetime", label: "Lifetime" }]} />
            </Field>
            {plan.validity.type === "days" && <Field label="Days"><input className={inputCls} type="number" min={1} value={plan.validity.days ?? 30} onChange={(e) => setPlan({ ...plan, validity: { type: "days", days: Number(e.target.value) } })} /></Field>}
            {plan.validity.type === "fixed_end" && <Field label="Ends at"><input className={inputCls} type="datetime-local" value={toLocalInput(plan.validity.ends_at)} onChange={(e) => setPlan({ ...plan, validity: { type: "fixed_end", ends_at: fromLocalInput(e.target.value) } })} /></Field>}
            <SaleFields plan={plan} onChange={setPlan} />
            <Field label="Highlights" hint="One per line; shown as ticks on the paywall.">
              <textarea className={inputCls + " h-24 py-2"} value={(plan.highlights ?? []).join("\n")}
                onChange={(e) => setPlan({ ...plan, highlights: e.target.value.split("\n") })} />
            </Field>
            <Field label="Badge"><input className={inputCls} value={plan.badge} onChange={(e) => setPlan({ ...plan, badge: e.target.value })} placeholder="Best value" /></Field>
            <div className="flex items-center gap-2 text-sm font-semibold"><Switch checked={plan.is_active} onCheckedChange={(v) => setPlan({ ...plan, is_active: v })} /> Active</div>
            <PaywallPreview plan={plan} programName={progName} />
          </div>
        )}
      </FormSheet>

      <FormSheet
        open={!!coupon}
        onOpenChange={(o) => !o && setCoupon(null)}
        title={coupon?.id ? "Edit coupon" : "New coupon"}
        tall
        footer={<><Button variant="secondary" className="h-11 flex-1 rounded-xl" onClick={() => setCoupon(null)}>Cancel</Button><Button className="h-11 flex-1 rounded-xl" onClick={saveCoupon}>Save coupon</Button></>}
      >
        {coupon && (
          <div className="space-y-4">
            <Field label="Code"><input className={inputCls} value={coupon.code} onChange={(e) => setCoupon({ ...coupon, code: e.target.value.toUpperCase() })} placeholder="WELCOME20" /></Field>
            <Field label="Type"><Segmented label="Coupon type" value={coupon.kind} onChange={(v) => setCoupon({ ...coupon, kind: v })} options={[{ value: "percent", label: "Percent" }, { value: "fixed", label: "Fixed (ETB)" }]} /></Field>
            <Field label={coupon.kind === "fixed" ? "Amount off (ETB)" : "Percent off"} hint={coupon.kind === "percent" ? "100 makes the plan free." : undefined}>
              <input className={inputCls} type="number" min={0} step={1} value={coupon.value}
                onChange={(e) => setCoupon({ ...coupon, value: coupon.kind === "fixed" ? Math.round(Number(e.target.value)) : Number(e.target.value) })} />
            </Field>
            <Field label="Valid for plans" hint="None selected = every plan.">
              <div className="flex flex-wrap gap-2">
                {(plans ?? []).map((p) => <Chip key={p.id} active={coupon.plan_ids.includes(p.id!)} onClick={() => setCoupon({ ...coupon, plan_ids: toggle(coupon.plan_ids, p.id!) })}>{p.name}</Chip>)}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Max uses" hint="0 = unlimited"><input className={inputCls} type="number" min={0} value={coupon.max_redemptions} onChange={(e) => setCoupon({ ...coupon, max_redemptions: Number(e.target.value) })} /></Field>
              <Field label="Per student"><input className={inputCls} type="number" min={0} value={coupon.per_student_limit} onChange={(e) => setCoupon({ ...coupon, per_student_limit: Number(e.target.value) })} /></Field>
            </div>
            <div className="flex items-center gap-2 text-sm font-semibold"><Switch checked={coupon.is_active} onCheckedChange={(v) => setCoupon({ ...coupon, is_active: v })} /> Active</div>
          </div>
        )}
      </FormSheet>

      <GrantAccessDialog open={grantOpen} onOpenChange={setGrantOpen} plans={plans ?? []} programName={progName} />

      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={`Delete ${del?.kind} “${del?.label}”?`}
        description="Existing payments and access are not affected."
        onConfirm={async () => {
          if (!del) return;
          try { await (del.kind === "plan" ? svc.deletePlan(del.id) : svc.deleteCoupon(del.id)); setDel(null); await load(); }
          catch (e) { toast.error(errMsg(e)); }
        }}
      />
    </div>
  );
}
