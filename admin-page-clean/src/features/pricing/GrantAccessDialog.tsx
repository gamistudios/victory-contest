// Grant / revoke access for one student (plan §5.12 admin extras).
// Grant  -> POST /api/pricing-admin/grant        (an approved, revocable ledger row)
// Revoke -> POST /api/pricing-admin/payments/:id/revoke (marks the row revoked, rebuilds entitlements)
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Segmented, errMsg, inputCls } from "@/features/lectures/admin/components/kit";
import { getAllStudents } from "@/services/studentServices";
import * as svc from "@/services/pricingServices";
import { formatDate } from "./dates";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  plans: svc.PricePlan[];
  programName: (id: string) => string;
}
interface Pick { id: string; name: string; telegram_id?: string }

export default function GrantAccessDialog({ open, onOpenChange, plans, programName }: Props) {
  const [students, setStudents] = useState<Pick[]>([]);
  const [query, setQuery] = useState("");
  const [student, setStudent] = useState<Pick | null>(null);
  const [mode, setMode] = useState<"grant" | "revoke">("grant");
  const [planId, setPlanId] = useState("");
  const [ents, setEnts] = useState<svc.StudentEntitlement[]>([]);
  const [pays, setPays] = useState<svc.StudentPayment[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const activePlans = useMemo(() => plans.filter((p) => p.is_active && p.id), [plans]);
  const planName = (id?: string) => plans.find((p) => p.id === id)?.name ?? (id ? "Deleted plan" : "Legacy payment");

  // Load the roster once when the dialog opens; reset when it closes.
  useEffect(() => {
    if (!open) { setStudent(null); setQuery(""); setConfirmId(null); setMode("grant"); return; }
    let alive = true;
    getAllStudents()
      .then((rows) => { if (alive) setStudents(rows.filter((s) => !!s.id).map((s) => ({ id: s.id as string, name: s.name, telegram_id: s.telegram_id }))); })
      .catch((e) => toast.error(errMsg(e)));
    return () => { alive = false; };
  }, [open]);
  useEffect(() => { if (open && !planId && activePlans[0]?.id) setPlanId(activePlans[0].id); }, [open, planId, activePlans]);

  const matches = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return [];
    return students.filter((s) => s.name?.toLowerCase().includes(t) || s.telegram_id?.includes(t) || s.id.toLowerCase().includes(t)).slice(0, 8);
  }, [students, query]);

  const loadStudent = useCallback(async (id: string) => {
    try {
      const [e, p] = await Promise.all([svc.studentEntitlements(id), svc.listStudentPayments(id)]);
      setEnts(e);
      setPays(p);
    } catch (err) { toast.error(errMsg(err)); }
  }, []);
  useEffect(() => { if (student) void loadStudent(student.id); else { setEnts([]); setPays([]); } }, [student, loadStudent]);

  const grant = async () => {
    if (!student || !planId) return;
    setBusy(true);
    try {
      await svc.grantPlan(student.id, planId);
      toast.success(`Access granted to ${student.name}`);
      await loadStudent(student.id);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const revoke = async (id: string) => {
    if (!student) return;
    setBusy(true);
    try {
      await svc.revokePayment(id);
      toast.success("Access revoked");
      setConfirmId(null);
      await loadStudent(student.id);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const revocable = pays.filter((p) => p.status === "Approved" && !p.revoked);
  const chosen = plans.find((p) => p.id === planId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Grant or revoke access</DialogTitle>
          <DialogDescription>Pick a student, then give them a plan or take an access row back.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!student ? (
            <div>
              <input className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search student by name, Telegram id or id…" aria-label="Search student" autoFocus />
              {query.trim() && matches.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No student matches “{query}”.</p>}
              <ul className="mt-2 space-y-1">
                {matches.map((s) => (
                  <li key={s.id}>
                    <button type="button" className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted/50" onClick={() => setStudent(s)}>
                      <span className="font-semibold">{s.name || "Unnamed"}</span><span className="text-xs text-muted-foreground">{s.telegram_id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span className="font-semibold">{student.name}</span>
                <button type="button" className="text-xs font-semibold text-primary" onClick={() => setStudent(null)}>Change</button>
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current access</p>
                {ents.length === 0 ? <p className="text-sm text-muted-foreground">No active access.</p> : (
                  <ul className="space-y-1 text-sm">
                    {ents.map((e) => (
                      <li key={e.id} className="flex justify-between gap-2"><span>{programName(e.program_id)}</span><span className="text-muted-foreground">{e.expires_at ? `until ${formatDate(e.expires_at)}` : "lifetime"}</span></li>
                    ))}
                  </ul>
                )}
              </div>

              <Segmented<"grant" | "revoke"> label="Action" value={mode} onChange={(m) => { setMode(m); setConfirmId(null); }} options={[{ value: "grant", label: "Grant" }, { value: "revoke", label: "Revoke" }]} />

              {mode === "grant" ? (
                <div className="space-y-3">
                  {activePlans.length === 0 ? <p className="text-sm text-muted-foreground">No active plans. Create one first.</p> : (
                    <>
                      <select className={inputCls} value={planId} onChange={(e) => setPlanId(e.target.value)} aria-label="Plan to grant">
                        {activePlans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      {chosen && (
                        <p className="text-xs text-muted-foreground">
                          Unlocks {chosen.all_programs ? "all programs" : chosen.program_ids.map(programName).join(", ")} ·{" "}
                          {chosen.validity.type === "days" ? `${chosen.validity.days} days from now` : chosen.validity.type === "lifetime" ? "lifetime" : `until ${formatDate(chosen.validity.ends_at)}`}. No money is recorded.
                        </p>
                      )}
                      <Button className="h-11 w-full rounded-xl" disabled={busy || !planId} onClick={grant}>{busy ? "Granting…" : "Grant access"}</Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {revocable.length === 0 ? <p className="text-sm text-muted-foreground">Nothing to revoke: no active approved access rows.</p> : revocable.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{planName(p.plan_id)} <span className="text-xs font-normal text-muted-foreground">· {p.bankName === "Admin grant" ? "admin grant" : "payment"}</span></p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatDate(p.createdAt)} → {p.expirationDate ? formatDate(p.expirationDate) : "lifetime"}{p.program_ids?.length ? ` · ${p.program_ids.map(programName).join(", ")}` : ""}
                        </p>
                      </div>
                      {confirmId === p.id
                        ? <Button size="sm" variant="destructive" disabled={busy} onClick={() => revoke(p.id)}>Confirm</Button>
                        : <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmId(p.id)}>Revoke</Button>}
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">Revoking marks the row as refunded/fraud and rebuilds the student’s access. It cannot be undone here.</p>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
