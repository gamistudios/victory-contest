import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { needsStreamChoice, registrationPrograms, useCatalog } from "../shared/scope/catalog";
import {
  enroll, inGrace, isEntitled, leaveProgram, myEnrollments, myEntitlements, setPrimaryProgram,
  type Enrollment, type Entitlement,
} from "../shared/pricing/api";

const sel = "h-11 rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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

  const load = useCallback(async () => {
    try {
      const [e, n] = await Promise.all([myEnrollments(), myEntitlements()]);
      setEnrollments(e.enrollments); setPrimary(e.primary_program_id);
      setEnts(Object.fromEntries(n.entitlements.map((x) => [x.program_id, x]))); setGrace(n.grace_days);
    } catch { setErr("Could not load your programs."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const name = (id: string) => catalog?.programs.find((p) => p.id === id)?.name ?? id;
  const available = useMemo(
    () => registrationPrograms(catalog).filter((p) => !enrollments.some((e) => e.program_id === p.id)),
    [catalog, enrollments]);
  const addProgram = available.find((p) => p.id === addId);

  const run = async (fn: () => Promise<unknown>) => {
    setErr("");
    try { await fn(); await load(); } catch (e: any) { setErr(e?.response?.data?.error ?? "Request failed"); }
  };

  const status = (programId: string) => {
    const e = ents[programId];
    if (!e) return <span className="text-xs opacity-70">Free</span>;
    if (!e.expires_at) return <span className="text-xs font-semibold text-green-700">Premium · lifetime</span>;
    const d = new Date(e.expires_at).toLocaleDateString();
    if (inGrace(e, grace)) return <span className="text-xs font-semibold text-yellow-700">Expired {d} · grace period</span>;
    return isEntitled(e, grace)
      ? <span className="text-xs font-semibold text-green-700">Premium until {d}</span>
      : <span className="text-xs font-semibold text-red-700">Expired {d}</span>;
  };

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="font-nunito text-xl font-extrabold">My programs</h1>
        <Link to="/payment" className="text-sm font-bold text-blue-700">Upgrade</Link>
      </div>
      {err && <p className="rounded-2xl bg-red-100 p-3 text-sm font-medium text-red-800">{err}</p>}

      <div className="space-y-1">
        <label className="text-sm font-medium">Active program</label>
        <select className={`${sel} w-full`} value={primary} onChange={(e) => run(() => setPrimaryProgram(e.target.value))}>
          {enrollments.map((e) => <option key={e.program_id} value={e.program_id}>{name(e.program_id)}</option>)}
        </select>
      </div>

      <ul className="divide-y rounded-xl border">
        {enrollments.map((e) => (
          <li key={e.program_id} className="flex items-center justify-between p-3">
            <div>
              <div className="font-medium">{name(e.program_id)}{e.program_id === primary && " ★"}</div>
              {e.stream_id !== "common" && <div className="text-xs opacity-70">{catalog?.streams.find((s) => s.id === e.stream_id)?.name ?? e.stream_id}</div>}
              {status(e.program_id)}
            </div>
            {enrollments.length > 1 && (
              <button className="text-sm font-semibold text-red-700" onClick={() => confirm("Leave this program?") && run(() => leaveProgram(e.program_id))}>Leave</button>
            )}
          </li>
        ))}
      </ul>

      {available.length > 0 && (
        <div className="space-y-2 rounded-xl border p-3">
          <div className="text-sm font-medium">Join another program</div>
          <select className={`${sel} w-full`} value={addId} onChange={(e) => { setAddId(e.target.value); setAddStream(""); }}>
            <option value="">Select a program</option>
            {available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {addProgram && needsStreamChoice(addProgram) && (
            <select className={`${sel} w-full`} value={addStream} onChange={(e) => setAddStream(e.target.value)}>
              <option value="">Select a stream</option>
              {addProgram.available_streams.filter((s) => s !== "common").map((s) => (
                <option key={s} value={s}>{catalog?.streams.find((x) => x.id === s)?.name ?? s}</option>
              ))}
            </select>
          )}
          <button disabled={!addId || (!!addProgram && needsStreamChoice(addProgram) && !addStream)}
            className="rounded bg-indigo-600 px-3 py-1 text-sm text-white disabled:opacity-50"
            onClick={() => run(async () => { await enroll(addId, addStream); setAddId(""); setAddStream(""); })}>
            Join
          </button>
        </div>
      )}
    </div>
  );
}
