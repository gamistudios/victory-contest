import { useEffect, useState } from "react";
import { EyeOff, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineError } from "@/features/lectures/components/States";
import { useAsync } from "@/features/lectures/hooks/useAsync";
import { iconFor, streamShort } from "@/features/lectures/lib/theme";
import { adminCreateProgram, adminDeleteProgram, adminGetTree, adminUpdateProgram, type ProgramInput } from "@/services/academy/academyApi";
import type { Program, Stream } from "@/types/academy";
import { Chip, ConfirmDialog, Field, FormSheet, PageTitle, Panel, errMsg, inputCls, areaCls } from "./components/kit";
import { cn } from "@/lib/utils";

const KINDS: { id: string; label: string }[] = [
  { id: "school_grade", label: "School grade" },
  { id: "entrance_exam", label: "Entrance exam" },
  { id: "remedial", label: "Remedial" },
  { id: "freshman", label: "Freshman" },
  { id: "exit_exam", label: "Exit exam" },
  { id: "training", label: "Training" },
  { id: "custom", label: "Custom" },
];
const FEATURES: { id: string; label: string }[] = [
  { id: "lectures", label: "Lectures" },
  { id: "assessments", label: "Assessments" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "ai_tutor", label: "AI tutor" },
  { id: "habits", label: "Habits" },
];
const GRADES = ["9", "10", "11", "12"];
const ICONS = ["GraduationCap", "BookOpen", "Target", "Award", "School", "Compass", "Layers", "Sparkles", "TrendingUp", "Zap"];

const blank = (order: number): ProgramInput => ({
  name: "",
  short_code: "",
  description: "",
  icon_name: "GraduationCap",
  kind: "custom",
  group: "",
  features: ["lectures", "assessments"],
  grade: "",
  available_streams: ["common"],
  open_for_registration: true,
  is_active: true,
  sort_order: order,
});

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function ProgramForm({ open, onOpenChange, program, streams, nextOrder, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; program: Program | null; streams: Stream[]; nextOrder: number; onSaved: () => void }) {
  const [f, setF] = useState<ProgramInput>(blank(nextOrder));
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setF(program ? { ...program } : blank(nextOrder));
      setErr(undefined);
    }
  }, [open, program, nextOrder]);

  const set = (patch: Partial<ProgramInput>) => setF((x) => ({ ...x, ...patch }));
  const offered = (f.available_streams ?? []).filter((s) => s !== "common");

  const submit = async () => {
    if ((f.name ?? "").trim().length < 2) return setErr("Name must be at least 2 characters");
    setBusy(true);
    try {
      const body: ProgramInput = { ...f, available_streams: ["common", ...offered].filter((v, i, a) => a.indexOf(v) === i) };
      if (program) await adminUpdateProgram(program.id, body);
      else await adminCreateProgram(body);
      toast.success(program ? "Program saved" : "Program created");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(errMsg(e)); // 409 = id taken, 400 = invalid kind/feature/stream/grade
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={program ? `Edit ${program.name}` : "Add program"}
      tall
      footer={
        <>
          <Button variant="outline" className="h-11 flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11 flex-1" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="grid grid-cols-[1fr_6.5rem] gap-3">
          <Field label="Name" htmlFor="pg-name" error={err}>
            <input id="pg-name" className={inputCls} value={f.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Entrance Exam" aria-invalid={!!err} />
          </Field>
          <Field label="Short code" htmlFor="pg-code">
            <input id="pg-code" className={inputCls} value={f.short_code ?? ""} onChange={(e) => set({ short_code: e.target.value })} maxLength={10} placeholder="EE" />
          </Field>
        </div>
        <Field label="Description" htmlFor="pg-desc">
          <textarea id="pg-desc" rows={2} className={areaCls} value={f.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Field label="Kind" hint="A label that drives presets only; access rules never branch on it.">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide" role="group" aria-label="Kind">
            {KINDS.map((k) => (
              <Chip key={k.id} active={f.kind === k.id} onClick={() => set({ kind: k.id })}>
                {k.label}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Streams offered" hint="“Common” is always available. Pick none for a common-only program.">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Streams">
            {streams.filter((s) => s.id !== "common").map((s) => (
              <Chip key={s.id} active={offered.includes(s.id)} onClick={() => set({ available_streams: toggle(offered, s.id) })}>
                {s.name}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Features">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Features">
            {FEATURES.map((x) => (
              <Chip key={x.id} active={(f.features ?? []).includes(x.id)} onClick={() => set({ features: toggle(f.features ?? [], x.id) })}>
                {x.label}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Grade" hint="Sets the student's grade when this is their primary program. Leave empty if it does not map to one.">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Grade">
            <Chip active={!f.grade} onClick={() => set({ grade: "" })}>None</Chip>
            {GRADES.map((g) => (
              <Chip key={g} active={f.grade === g} onClick={() => set({ grade: g })}>
                Grade {g}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Group" htmlFor="pg-group" hint="Optional heading used to group programs in registration.">
          <input id="pg-group" className={inputCls} value={f.group ?? ""} onChange={(e) => set({ group: e.target.value })} placeholder="e.g. School grades" />
        </Field>
        <Field label="Icon">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Icon">
            {ICONS.map((n) => {
              const I = iconFor(n);
              return (
                <button key={n} type="button" role="radio" aria-checked={f.icon_name === n} aria-label={n} onClick={() => set({ icon_name: n })} className={cn("flex h-11 w-11 items-center justify-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", f.icon_name === n ? "border-transparent bg-blue-fix-600 text-white" : "border-border bg-card text-foreground")}>
                  <I className="h-5 w-5" aria-hidden />
                </button>
              );
            })}
          </div>
        </Field>
        <div className="flex min-h-11 items-center justify-between rounded-lg border border-border px-3">
          <span className="text-sm font-semibold">Open for registration</span>
          <Switch checked={!!f.open_for_registration} onCheckedChange={(v) => set({ open_for_registration: v })} aria-label="Open for registration" />
        </div>
        <Field label="Sort order" htmlFor="pg-sort">
          <input id="pg-sort" type="number" className={inputCls} value={f.sort_order ?? 0} onChange={(e) => set({ sort_order: Number(e.target.value) })} />
        </Field>
      </form>
    </FormSheet>
  );
}

export default function Programs() {
  const { data, loading, error, reload, refresh, setData } = useAsync(() => adminGetTree(), []);
  const [form, setForm] = useState<{ program: Program | null } | null>(null);
  const [hide, setHide] = useState<Program | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (loading && !data)
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading programs">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
    );
  if (error || !data) return <InlineError message={error} onRetry={reload} />;

  const programs = [...data.programs].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const counts = new Map<string, number>();
  for (const s of data.tree) counts.set(s.level_id, (counts.get(s.level_id) ?? 0) + 1);

  const setActive = async (p: Program, v: boolean) => {
    setBusy(p.id);
    setData({ ...data, programs: data.programs.map((x) => (x.id === p.id ? { ...x, is_active: v } : x)) });
    try {
      if (v) await adminUpdateProgram(p.id, { ...p, is_active: true });
      else await adminDeleteProgram(p.id); // soft delete: content and enrollments are kept
      toast.success(`${p.name} ${v ? "is live" : "hidden from students"}`);
    } catch (e) {
      toast.error(errMsg(e));
      refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageTitle
        title="Programs"
        hint="Everything students can enroll in"
        action={
          <Button className="h-11" onClick={() => setForm({ program: null })}>
            <Plus className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Add</span> program
          </Button>
        }
      />
      <ul className="grid items-start gap-3 lg:grid-cols-2">
        {programs.map((p) => {
          const Icon = iconFor(p.icon_name);
          return (
            <li key={p.id}>
              <Panel className={p.is_active ? "" : "opacity-80"}>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.short_code} · {counts.get(p.id) ?? 0} subject{(counts.get(p.id) ?? 0) === 1 ? "" : "s"} · {p.is_active ? "Live" : "Hidden"}
                    </p>
                  </div>
                  <button type="button" aria-label={`Edit ${p.name}`} onClick={() => setForm({ program: p })} className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                  <Switch checked={p.is_active} disabled={busy === p.id} onCheckedChange={(v) => (v ? setActive(p, true) : setHide(p))} aria-label={`${p.name} active`} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                  {p.kind && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{KINDS.find((k) => k.id === p.kind)?.label ?? p.kind}</span>}
                  {(p.available_streams ?? []).map((s) => (
                    <span key={s} className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">{streamShort(data.streams, s)}</span>
                  ))}
                  {p.grade && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Grade {p.grade}</span>}
                  {p.open_for_registration === false && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-fix-600/15 px-2 py-0.5 text-yellow-800"><EyeOff className="h-3 w-3" aria-hidden /> Registration closed</span>
                  )}
                  {(p.features ?? []).map((x) => (
                    <span key={x} className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">{FEATURES.find((y) => y.id === x)?.label ?? x}</span>
                  ))}
                </div>
              </Panel>
            </li>
          );
        })}
      </ul>

      <ProgramForm open={form !== null} onOpenChange={(o) => !o && setForm(null)} program={form?.program ?? null} streams={data.streams} nextOrder={(programs.at(-1)?.sort_order ?? 0) + 10} onSaved={refresh} />
      <ConfirmDialog
        open={hide !== null}
        onOpenChange={(o) => !o && setHide(null)}
        title="Hide this program?"
        description={hide ? `"${hide.name}" disappears from registration and the student app. Content and existing enrollments are kept.` : undefined}
        confirmLabel="Hide"
        onConfirm={() => { if (hide) return setActive(hide, false); }}
      />
    </div>
  );
}
