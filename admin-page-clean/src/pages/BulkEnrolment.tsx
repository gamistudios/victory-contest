import { useEffect, useMemo, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip, ConfirmDialog, Field, PageTitle, Panel, PanelTitle, errMsg, inputCls } from "@/academy/admin/components/kit";
import { getAllStudents, type StudentRow } from "@/services/studentServices";
import { getAdminCatalog, type AdminCatalog } from "@/services/catalogServices";
import { bulkEnroll } from "@/services/pricingServices";

/** Enrol many students into one program (and stream) at once. Per-student access lives in the Users access sheet. */
export default function BulkEnrolment() {
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [catalog, setCatalog] = useState<AdminCatalog | null>(null);
  const [programId, setProgramId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [q, setQ] = useState("");
  const [grade, setGrade] = useState("");
  const [region, setRegion] = useState("");
  const [skipEnrolled, setSkipEnrolled] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    getAllStudents().then(setStudents).catch((e) => { toast.error(errMsg(e)); setStudents([]); });
    getAdminCatalog().then(setCatalog).catch((e) => toast.error(errMsg(e)));
  }, []);

  const programs = (catalog?.programs ?? []).filter((p) => p.is_active !== false);
  const program = programs.find((p) => p.id === programId);
  const streams = useMemo(() => {
    if (!program) return [];
    const offered = (program.available_streams ?? []).filter((s) => s !== "common");
    return offered.map((id) => ({ id, name: catalog?.streams?.find((s) => s.id === id)?.name ?? id }));
  }, [program, catalog]);
  const needsStream = streams.length > 0;
  const grades = useMemo(() => Array.from(new Set((students ?? []).map((s) => String(s.grade ?? "")).filter(Boolean))).sort((a, b) => Number(a) - Number(b)), [students]);
  const regions = catalog?.locations?.regions ?? [];

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (students ?? []).filter((s) => {
      if (t && !`${s.name} ${s.telegram_id} ${s.school ?? ""}`.toLowerCase().includes(t)) return false;
      if (grade && String(s.grade) !== grade) return false;
      if (region && s.region_id !== region) return false;
      if (skipEnrolled && programId && s.enrollments?.some((e) => e.program_id === programId)) return false;
      return true;
    });
  }, [students, q, grade, region, skipEnrolled, programId]);

  const ids = rows.map((s) => s.id ?? s.telegram_id);
  const allPicked = ids.length > 0 && ids.every((i) => picked.has(i));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const chosen = ids.filter((i) => picked.has(i));
  const ready = !!programId && (!needsStream || !!streamId) && chosen.length > 0;

  const run = async () => {
    try {
      const r = await bulkEnroll(chosen, programId, needsStream ? streamId : "");
      const failed = Array.isArray(r?.failed) ? r.failed.length : r?.failed && typeof r.failed === "object" ? Object.keys(r.failed).length : Number(r?.failed ?? 0);
      toast.success(`Enrolled ${chosen.length - failed} of ${chosen.length}${failed ? `. ${failed} failed (already enrolled or invalid).` : "."}`);
      setConfirm(false);
      setPicked(new Set());
      setStudents(await getAllStudents());
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 pb-28">
      <PageTitle title="Bulk enrolment" hint="Pick a program, filter students, enrol them in one step. Admin enrolments are marked confirmed." />

      <Panel>
        <PanelTitle icon={UserPlus}>1. Target program</PanelTitle>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Program">
          {programs.map((p) => <Chip key={p.id} active={programId === p.id} onClick={() => { setProgramId(p.id); setStreamId(""); }}>{p.name}</Chip>)}
        </div>
        {needsStream && (
          <Field label="Stream" className="mt-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Stream">
              {streams.map((s) => <Chip key={s.id} active={streamId === s.id} onClick={() => setStreamId(s.id)}>{s.name}</Chip>)}
            </div>
          </Field>
        )}
      </Panel>

      <Panel>
        <PanelTitle icon={Search}>2. Choose students</PanelTitle>
        <div className="grid gap-3 md:grid-cols-3">
          <input className={inputCls} placeholder="Search name, Telegram id, school" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search students" />
          <select className={inputCls} value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Grade">
            <option value="">All grades</option>
            {grades.map((g) => <option key={g} value={g}>Grade {g}</option>)}
          </select>
          <select className={inputCls} value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Region">
            <option value="">All regions</option>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <input type="checkbox" className="h-5 w-5" checked={skipEnrolled} onChange={(e) => setSkipEnrolled(e.target.checked)} /> Hide students already in this program
        </label>

        {!students ? <Skeleton className="mt-3 h-40 w-full rounded-xl" /> : (
          <>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-muted px-3 py-2 text-sm">
              <label className="flex items-center gap-2 font-semibold">
                <input type="checkbox" className="h-5 w-5" checked={allPicked}
                  onChange={() => setPicked((p) => { const n = new Set(p); allPicked ? ids.forEach((i) => n.delete(i)) : ids.forEach((i) => n.add(i)); return n; })} />
                Select all {rows.length} shown
              </label>
              <span className="text-muted-foreground">{chosen.length} selected</span>
            </div>
            <ul className="mt-2 max-h-[48dvh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {rows.slice(0, 500).map((s) => {
                const id = s.id ?? s.telegram_id;
                return (
                  <li key={id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/60">
                      <input type="checkbox" className="h-5 w-5" checked={picked.has(id)} onChange={() => toggle(id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">{s.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">Grade {s.grade} · {s.city || s.region || "no location"}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
              {rows.length === 0 && <li className="p-4 text-sm text-muted-foreground">No students match these filters.</li>}
            </ul>
            {rows.length > 500 && <p className="mt-1 text-xs text-muted-foreground">Showing the first 500. Narrow the filters to reach the rest.</p>}
          </>
        )}
      </Panel>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card p-3 pb-safe lg:left-[var(--sidebar-width,0px)]">
        <Button className="mx-auto flex h-12 w-full max-w-4xl rounded-xl" disabled={!ready} onClick={() => setConfirm(true)}>
          Enrol {chosen.length || ""} student{chosen.length === 1 ? "" : "s"}{program ? ` in ${program.name}` : ""}
        </Button>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        destructive={false}
        confirmLabel="Enrol"
        title={`Enrol ${chosen.length} students?`}
        description={`They will be enrolled in ${program?.name ?? ""}${streamId ? ` (${streams.find((s) => s.id === streamId)?.name})` : ""}. Existing enrolments are kept.`}
        onConfirm={run}
      />
    </div>
  );
}
