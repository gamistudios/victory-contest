import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormSheet, Field, errMsg } from "@/academy/admin/components/kit";
import * as svc from "@/services/pricingServices";
import { fetchApprovedPayments } from "@/services/paymentServices";
import type { AdminCatalog } from "@/services/catalogServices";
import type { PaymentRequest } from "@/types/payment";
import type { Student } from "@/types/models";

const sel = "h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm";
const fmt = (s: string) => (s ? new Date(s).toLocaleDateString() : "Lifetime");

interface Ent { id: string; program_id: string; expires_at: string; source: string }

/** Per-student access tools: entitlements, grant a plan, revoke a payment, manage enrollments. */
export function UserAccessSheet({ student, catalog, onOpenChange, onChanged }: { student: Student | null; catalog: AdminCatalog | null; onOpenChange: (o: boolean) => void; onChanged: () => void }) {
  const sid = student?.id ?? "";
  const [plans, setPlans] = useState<svc.PricePlan[]>([]);
  const [ents, setEnts] = useState<Ent[]>([]);
  const [enr, setEnr] = useState<{ enrollments: { program_id: string; stream_id: string }[]; primary_program_id: string } | null>(null);
  const [pays, setPays] = useState<PaymentRequest[]>([]);
  const [planId, setPlanId] = useState("");
  const [prog, setProg] = useState("");
  const [stream, setStream] = useState("common");
  const [busy, setBusy] = useState(false);

  const pname = (id: string) => catalog?.programs.find((p) => p.id === id)?.name ?? id;

  const load = useCallback(async () => {
    if (!sid) return;
    const [p, e, en, ap] = await Promise.all([
      svc.listPlans().catch(() => []),
      svc.studentEntitlements(sid).catch(() => []),
      svc.adminEnrollments(sid).catch(() => null),
      fetchApprovedPayments().catch(() => []),
    ]);
    setPlans(p);
    setEnts(e);
    setEnr(en);
    setPays(ap.filter((x) => x.userId === sid || x.userId === student?.telegram_id));
  }, [sid, student?.telegram_id]);

  useEffect(() => {
    setPlanId("");
    setProg("");
    if (student) void load();
  }, [student, load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await load();
      onChanged();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const chosen = catalog?.programs.find((p) => p.id === prog);
  const streamChoices = (chosen?.available_streams ?? []).filter((s) => s !== "common").concat("common");

  return (
    <FormSheet open={student !== null} onOpenChange={onOpenChange} title={student ? `Access · ${student.name}` : "Access"} description="Grant or revoke paid access and manage program enrollments." tall>
      <div className="space-y-5">
        <section aria-label="Current access" className="space-y-2">
          <h3 className="text-sm font-bold">Current access</h3>
          {ents.length === 0 && <p className="text-sm text-muted-foreground">No active entitlements.</p>}
          <ul className="space-y-1.5">
            {ents.map((e) => (
              <li key={e.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span className="font-semibold">{pname(e.program_id)}</span>
                <span className="text-xs text-muted-foreground">until {fmt(e.expires_at)} · {e.source}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <select className={sel} value={planId} onChange={(e) => setPlanId(e.target.value)} aria-label="Plan to grant">
              <option value="">Plan to grant…</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Button className="h-11" disabled={busy || !planId} onClick={() => run(() => svc.grantPlan(sid, planId), "Plan granted")}>Grant</Button>
            <Button className="h-11 w-11 shrink-0 p-0" variant="outline" disabled={busy} aria-label="Rebuild entitlements" title="Rebuild from payments" onClick={() => run(() => svc.rebuildEntitlements(sid), "Entitlements rebuilt")}>
              <RefreshCw className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </section>

        <section aria-label="Approved payments" className="space-y-2">
          <h3 className="text-sm font-bold">Approved payments</h3>
          {pays.length === 0 && <p className="text-sm text-muted-foreground">None.</p>}
          <ul className="space-y-1.5">
            {pays.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{p.bankName} · {new Date(p.updatedAt).toLocaleDateString()}</span>
                <Button size="sm" variant="outline" className="h-9 shrink-0 text-destructive" disabled={busy} onClick={() => window.confirm("Revoke access from this payment?") && run(() => svc.revokePayment(p.id), "Payment revoked")}>
                  <ShieldOff className="mr-1.5 h-4 w-4" aria-hidden /> Revoke
                </Button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Enrollments" className="space-y-2">
          <h3 className="text-sm font-bold">Enrollments</h3>
          <ul className="space-y-1.5">
            {(enr?.enrollments ?? []).map((e) => (
              <li key={e.program_id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span className="font-semibold">{pname(e.program_id)} <span className="font-normal text-muted-foreground">· {catalog?.streams.find((s) => s.id === e.stream_id)?.name ?? e.stream_id}{enr?.primary_program_id === e.program_id ? " · primary" : ""}</span></span>
                <button type="button" aria-label={`Remove ${pname(e.program_id)}`} disabled={busy} onClick={() => run(() => svc.adminLeave(sid, e.program_id), "Removed")} className="flex h-9 w-9 items-center justify-center rounded-lg text-destructive hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <Field label="Add to program">
            <div className="flex gap-2">
              <select className={sel} value={prog} onChange={(e) => { setProg(e.target.value); setStream("common"); }} aria-label="Program">
                <option value="">Program…</option>
                {(catalog?.programs ?? []).filter((p) => p.is_active && !(enr?.enrollments ?? []).some((e) => e.program_id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {chosen && streamChoices.length > 1 && (
                <select className={sel} value={stream} onChange={(e) => setStream(e.target.value)} aria-label="Stream">
                  {streamChoices.map((s) => <option key={s} value={s}>{catalog?.streams.find((x) => x.id === s)?.name ?? s}</option>)}
                </select>
              )}
              <Button className="h-11" disabled={busy || !prog} onClick={() => run(() => svc.adminEnroll(sid, prog, stream), "Enrolled")}>Add</Button>
            </div>
          </Field>
        </section>
      </div>
    </FormSheet>
  );
}
