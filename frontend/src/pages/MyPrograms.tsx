import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Crown, GraduationCap, LogOut, Plus, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errData } from "@/services/api";
import { cn } from "@/lib/utils";
import { CardSkeleton, EmptyState, InlineError } from "../academy/components/States";
import { SectionTitle } from "../academy/components/PageHeader";
import { needsStreamChoice, registrationPrograms, useCatalog } from "../shared/scope/catalog";
import {
  enroll, inGrace, isEntitled, leaveProgram, myEnrollments, myEntitlements, setPrimaryProgram,
  type Enrollment, type Entitlement,
} from "../shared/pricing/api";

type Tone = "free" | "ok" | "warn" | "bad";
const pill: Record<Tone, string> = {
  free: "bg-muted text-muted-foreground",
  ok: "bg-green-100 text-green-800",
  warn: "bg-yellow-100 text-yellow-800",
  bad: "bg-red-100 text-red-800",
};

/** Program switcher + My programs: enrollments, access status, add/leave. */
export default function MyPrograms() {
  const { catalog } = useCatalog();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [primary, setPrimary] = useState("");
  const [ents, setEnts] = useState<Record<string, Entitlement>>({});
  const [grace, setGrace] = useState(3);
  const [addId, setAddId] = useState("");
  const [addStream, setAddStream] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [e, n] = await Promise.all([myEnrollments(), myEntitlements()]);
      setEnrollments(e.enrollments); setPrimary(e.primary_program_id);
      setEnts(Object.fromEntries(n.entitlements.map((x) => [x.program_id, x]))); setGrace(n.grace_days);
      setErr("");
    } catch { setErr("Could not load your programs."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const name = (id: string) => catalog?.programs.find((p) => p.id === id)?.name ?? id;
  const streamName = (id: string) => catalog?.streams.find((s) => s.id === id)?.name ?? id;
  const available = useMemo(
    () => registrationPrograms(catalog).filter((p) => !enrollments.some((e) => e.program_id === p.id)),
    [catalog, enrollments]);
  const addProgram = available.find((p) => p.id === addId);
  const streamMissing = !!addProgram && needsStreamChoice(addProgram) && !addStream;

  const run = async (fn: () => Promise<unknown>) => {
    setErr(""); setBusy(true);
    try { await fn(); await load(); } catch (e) { setErr(errData(e).error || "Request failed"); }
    finally { setBusy(false); }
  };

  const status = (programId: string): { tone: Tone; text: string } => {
    const e = ents[programId];
    if (!e) return { tone: "free", text: "Free" };
    if (!e.expires_at) return { tone: "ok", text: "Premium · lifetime" };
    const d = new Date(e.expires_at).toLocaleDateString();
    if (inGrace(e, grace)) return { tone: "warn", text: `Expired ${d} · grace period` };
    return isEntitled(e, grace) ? { tone: "ok", text: `Premium until ${d}` } : { tone: "bad", text: `Expired ${d}` };
  };

  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 pb-28">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-nunito text-2xl font-extrabold text-foreground">My programs</h1>
          <p className="text-sm text-muted-foreground">Pick what you study and manage your access.</p>
        </div>
        <Button asChild size="sm" className="shrink-0 gap-1.5 rounded-xl">
          <Link to="/payment"><Sparkles className="h-4 w-4" /> Upgrade</Link>
        </Button>
      </div>

      {err && <InlineError message={err} onRetry={load} />}

      <section>
        <SectionTitle>Enrolled</SectionTitle>
        {loading ? (
          <div className="space-y-3"><CardSkeleton /><CardSkeleton /></div>
        ) : enrollments.length === 0 ? (
          <EmptyState icon={<GraduationCap className="h-6 w-6" />} title="No programs yet" hint="Join a program below to unlock lessons and practice." />
        ) : (
          <ul className="space-y-3">
            {enrollments.map((e) => {
              const isPrimary = e.program_id === primary;
              const st = status(e.program_id);
              return (
                <li key={e.program_id}
                  className={cn("rounded-2xl border bg-card p-4 transition", isPrimary ? "border-blue-300 ring-2 ring-blue-100" : "border-border")}>
                  <div className="flex items-start gap-3">
                    <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", isPrimary ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground")}>
                      <GraduationCap className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-base font-bold text-foreground">{name(e.program_id)}</p>
                        {isPrimary && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                            <Star className="h-3 w-3 fill-current" aria-hidden /> Active
                          </span>
                        )}
                      </div>
                      {e.stream_id !== "common" && <p className="text-xs text-muted-foreground">{streamName(e.stream_id)}</p>}
                      <span className={cn("mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", pill[st.tone])}>
                        {st.tone === "ok" && <Crown className="h-3 w-3" aria-hidden />}
                        {st.text}
                      </span>
                    </div>
                  </div>
                  {(!isPrimary || enrollments.length > 1) && (
                    <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                      {!isPrimary && (
                        <Button size="sm" disabled={busy} className="h-10 flex-1 rounded-xl" onClick={() => run(() => setPrimaryProgram(e.program_id))}>
                          <CheckCircle2 className="h-4 w-4" /> Make active
                        </Button>
                      )}
                      {enrollments.length > 1 && (
                        <Button size="sm" variant="outline" disabled={busy}
                          className={cn("h-10 rounded-xl text-red-700 hover:text-red-800", isPrimary && "ml-auto")}
                          onClick={() => confirm("Leave this program?") && run(() => leaveProgram(e.program_id))}>
                          <LogOut className="h-4 w-4" /> Leave
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {available.length > 0 && (
        <section>
          <SectionTitle>Join another program</SectionTitle>
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="grid gap-2" role="radiogroup" aria-label="Program">
              {available.map((p) => {
                const on = addId === p.id;
                return (
                  <button key={p.id} type="button" role="radio" aria-checked={on}
                    onClick={() => { setAddId(on ? "" : p.id); setAddStream(""); }}
                    className={cn("flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 text-left transition active:scale-[0.98]",
                      on ? "border-blue-400 bg-blue-50" : "border-border bg-background hover:bg-muted")}>
                    <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", on ? "border-blue-600 bg-blue-600" : "border-muted-foreground/40")}>
                      {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="text-sm font-semibold text-foreground">{p.name}</span>
                  </button>
                );
              })}
            </div>

            {addProgram && needsStreamChoice(addProgram) && (
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Stream</p>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Stream">
                  {addProgram.available_streams.filter((s) => s !== "common").map((s) => (
                    <button key={s} role="tab" aria-selected={addStream === s} onClick={() => setAddStream(s)}
                      className={cn("h-10 rounded-lg text-sm font-bold transition", addStream === s ? "bg-card shadow-sm" : "text-muted-foreground")}>
                      {streamName(s)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button disabled={!addId || streamMissing || busy} className="h-11 w-full rounded-xl"
              onClick={() => run(async () => { await enroll(addId, addStream); setAddId(""); setAddStream(""); })}>
              <Plus className="h-4 w-4" /> {streamMissing ? "Choose a stream to join" : "Join program"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
