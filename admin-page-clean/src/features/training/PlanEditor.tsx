// Phase 6: author 30-day habit tracks (days x checklist items). Free/premium follows the same access
// model as everything else; there is no habit price and no points (decision 16).
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getAdminCatalog } from "@/services/catalogServices";
import { Chip, ConfirmDialog, Field, FormSheet, IconBtn, Panel, Segmented, errMsg, inputCls, uid } from "@/features/lectures/admin/components/kit";
import { deleteHabitPlan, listHabitPlans, saveHabitPlan, type HabitAccess, type HabitPlan } from "./api";

interface DraftItem { key: string; id: string; label: string }
interface DraftDay { title: string; items: DraftItem[] }
interface Draft { id?: string; title: string; program_id: string; access: HabitAccess; is_active: boolean; days: Record<number, DraftDay> }

const DAYS = Array.from({ length: 30 }, (_, i) => i + 1);
const emptyDay = (): DraftDay => ({ title: "", items: [] });

const toDraft = (p?: HabitPlan, programId = ""): Draft => {
  const days: Record<number, DraftDay> = {};
  p?.days.forEach((d) => { days[d.day] = { title: d.title, items: d.items.map((i) => ({ key: i.id, id: i.id, label: i.label })) }; });
  return { id: p?.id, title: p?.title ?? "", program_id: p?.program_id ?? programId, access: p?.access ?? "free", is_active: p?.is_active ?? true, days };
};

const toPayload = (d: Draft) => ({
  id: d.id, title: d.title.trim(), program_id: d.program_id, access: d.access, is_active: d.is_active,
  days: DAYS.filter((n) => d.days[n] && (d.days[n].items.some((i) => i.label.trim()) || d.days[n].title.trim()))
    .map((n) => ({ day: n, title: d.days[n].title.trim(), items: d.days[n].items.filter((i) => i.label.trim()).map((i) => ({ id: i.id, label: i.label.trim() })) })),
});

export default function PlanEditor() {
  const qc = useQueryClient();
  const catalog = useQuery({ queryKey: ["admin-catalog"], queryFn: () => getAdminCatalog() });
  const habitPrograms = useMemo(() => (catalog.data?.programs ?? []).filter((p) => p.features?.includes("habits")), [catalog.data]);
  const programName = (id: string) => habitPrograms.find((p) => p.id === id)?.name ?? id;

  const plans = useQuery({ queryKey: ["habit-plans"], queryFn: () => listHabitPlans() });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [day, setDay] = useState(1);
  const [toDelete, setToDelete] = useState<HabitPlan | null>(null);

  const save = useMutation({
    mutationFn: (p: ReturnType<typeof toPayload>) => saveHabitPlan(p),
    onSuccess: () => { toast.success("Track saved"); setDraft(null); qc.invalidateQueries({ queryKey: ["habit-plans"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteHabitPlan(id),
    onSuccess: () => { toast.success("Track deleted"); qc.invalidateQueries({ queryKey: ["habit-plans"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });

  const open = (p?: HabitPlan) => { setDraft(toDraft(p, habitPrograms[0]?.id)); setDay(1); };
  const patchDay = (n: number, fn: (d: DraftDay) => DraftDay) =>
    setDraft((d) => (d ? { ...d, days: { ...d.days, [n]: fn(d.days[n] ?? emptyDay()) } } : d));

  const copyToAll = () => {
    if (!draft) return;
    const src = draft.days[day] ?? emptyDay();
    const days: Record<number, DraftDay> = {};
    DAYS.forEach((n) => { days[n] = { title: n === day ? src.title : draft.days[n]?.title ?? "", items: src.items.map((i) => ({ key: uid("i"), id: "", label: i.label })) }; });
    setDraft({ ...draft, days });
    toast.success(`Day ${day} checklist copied to all 30 days`);
  };

  const problem = !draft ? "" : !draft.title.trim() ? "Give the track a title." : !draft.program_id ? "Choose a program with the Habits feature."
    : !toPayload(draft).days.some((d) => d.items.length) ? "Add at least one checklist item." : "";

  const cur = draft?.days[day] ?? emptyDay();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">30-day tracks students can start. A premium track needs the program's paid access.</p>
        <Button className="h-11 gap-1.5 rounded-xl" onClick={() => open()} disabled={habitPrograms.length === 0}><Plus className="h-4 w-4" aria-hidden /> New track</Button>
      </div>
      {!catalog.isLoading && habitPrograms.length === 0 && (
        <Panel><p className="text-sm text-muted-foreground">No program has the <b>Habits</b> feature yet. Enable it on the Training program first (Programs → edit → features).</p></Panel>
      )}
      {plans.isLoading && <Panel>Loading…</Panel>}
      {plans.isError && <Panel><p role="alert" className="text-sm font-semibold text-destructive">{errMsg(plans.error)}</p></Panel>}
      {plans.data?.length === 0 && <Panel><p className="text-sm text-muted-foreground">No tracks yet.</p></Panel>}
      <div className="grid gap-3 md:grid-cols-2">
        {plans.data?.map((p) => (
          <Panel key={p.id} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate font-bold text-foreground">{p.title}</h3>
              <p className="text-xs text-muted-foreground">{programName(p.program_id)} · {p.days.length} days · {p.days.reduce((n, d) => n + d.items.length, 0)} items</p>
              <p className="mt-1 flex gap-1.5 text-xs font-semibold">
                <span className={p.access === "premium" ? "text-amber-600" : "text-emerald-600"}>{p.access === "premium" ? "Premium" : "Free"}</span>
                <span className={p.is_active ? "text-blue-600" : "text-muted-foreground"}>{p.is_active ? "Active" : "Hidden"}</span>
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <IconBtn label={`Edit ${p.title}`} icon={Pencil} onClick={() => open(p)} />
              <IconBtn label={`Delete ${p.title}`} icon={Trash2} tone="danger" onClick={() => setToDelete(p)} />
            </div>
          </Panel>
        ))}
      </div>

      <FormSheet
        open={!!draft} onOpenChange={(o) => !o && setDraft(null)} tall
        title={draft?.id ? "Edit track" : "New track"} description="Days × checklist items. Students tick items each day."
        footer={<>
          <Button variant="secondary" className="h-11 flex-1 rounded-xl" onClick={() => setDraft(null)}>Cancel</Button>
          <Button className="h-11 flex-1 rounded-xl" disabled={!!problem || save.isPending} onClick={() => draft && save.mutate(toPayload(draft))}>{save.isPending ? "Saving…" : "Save track"}</Button>
        </>}
      >
        {draft && (
          <div className="space-y-4">
            <Field label="Title" htmlFor="hp-title"><input id="hp-title" className={inputCls} value={draft.title} maxLength={120} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
            <Field label="Program" htmlFor="hp-prog">
              <select id="hp-prog" className={inputCls} value={draft.program_id} disabled={!!draft.id} onChange={(e) => setDraft({ ...draft, program_id: e.target.value })}>
                {habitPrograms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Access">
                <Segmented<HabitAccess> label="Access" value={draft.access} onChange={(v) => setDraft({ ...draft, access: v })} options={[{ value: "free", label: "Free" }, { value: "premium", label: "Premium" }]} />
              </Field>
              <Field label="Visible to students">
                <Segmented<"on" | "off"> label="Active" value={draft.is_active ? "on" : "off"} onChange={(v) => setDraft({ ...draft, is_active: v === "on" })} options={[{ value: "on", label: "Active" }, { value: "off", label: "Hidden" }]} />
              </Field>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Day</p>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {DAYS.map((n) => <Chip key={n} active={n === day} onClick={() => setDay(n)} className={draft.days[n]?.items.length ? "ring-1 ring-emerald-500/50" : ""}>{n}</Chip>)}
              </div>
            </div>

            <Field label={`Day ${day} title (optional)`} htmlFor="hp-day-title">
              <input id="hp-day-title" className={inputCls} value={cur.title} maxLength={120} onChange={(e) => patchDay(day, (d) => ({ ...d, title: e.target.value }))} />
            </Field>
            <div className="space-y-2">
              {cur.items.map((it, idx) => (
                <div key={it.key} className="flex items-center gap-2">
                  <input aria-label={`Day ${day} item ${idx + 1}`} className={inputCls} value={it.label} maxLength={200} placeholder="e.g. 10 minute walk"
                    onChange={(e) => patchDay(day, (d) => ({ ...d, items: d.items.map((x) => (x.key === it.key ? { ...x, label: e.target.value } : x)) }))} />
                  <IconBtn label="Remove item" icon={Trash2} tone="danger" onClick={() => patchDay(day, (d) => ({ ...d, items: d.items.filter((x) => x.key !== it.key) }))} />
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" className="h-11 gap-1.5 rounded-xl" disabled={cur.items.length >= 20}
                  onClick={() => patchDay(day, (d) => ({ ...d, items: [...d.items, { key: uid("i"), id: "", label: "" }] }))}><Plus className="h-4 w-4" aria-hidden /> Add item</Button>
                <Button variant="ghost" className="h-11 gap-1.5 rounded-xl" onClick={copyToAll} disabled={cur.items.length === 0}><Copy className="h-4 w-4" aria-hidden /> Use this checklist for all days</Button>
              </div>
            </div>
            {problem && <p role="alert" className="text-xs font-semibold text-destructive">{problem}</p>}
          </div>
        )}
      </FormSheet>

      <ConfirmDialog
        open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title="Delete this track?"
        description="Students lose access to it and their progress on it is no longer shown. Consider hiding it instead."
        onConfirm={async () => { if (toDelete) await del.mutateAsync(toDelete.id); setToDelete(null); }}
      />
    </div>
  );
}
