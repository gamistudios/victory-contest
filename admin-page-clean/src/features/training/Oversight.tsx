// Phase 6 oversight: admin-only view of who is on a track, sorted by last activity, with an
// "inactive >= N days" filter and a nudge through the existing notification path. Never shown to students.
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import DataTable from "@/shared/ui/DataTable";
import { getAdminCatalog } from "@/services/catalogServices";
import { Panel, Segmented, errMsg, inputCls } from "@/features/lectures/admin/components/kit";
import { getOversight, listHabitPlans, sendNudge, type OversightRow } from "./api";

const when = (iso: string) => (iso ? new Date(iso).toLocaleString() : "Never");

export default function Oversight() {
  const [program, setProgram] = useState("");
  const [plan, setPlan] = useState("");
  const [inactive, setInactive] = useState(0);
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const catalog = useQuery({ queryKey: ["admin-catalog"], queryFn: () => getAdminCatalog() });
  const programs = (catalog.data?.programs ?? []).filter((p) => p.features?.includes("habits"));
  const plans = useQuery({ queryKey: ["habit-plans", program], queryFn: () => listHabitPlans(program || undefined) });
  const rows = useQuery({
    queryKey: ["habit-oversight", program, plan, inactive, order],
    queryFn: () => getOversight({ program_id: program, plan_id: plan, inactive_days: inactive, order }),
  });

  const nudge = useMutation({
    mutationFn: (r: OversightRow) => sendNudge(r.student_id, r.plan_id),
    onSuccess: () => toast.success("Nudge sent"),
    onError: (e) => toast.error(errMsg(e)),
  });

  const columns = useMemo<ColumnDef<OversightRow, any>[]>(() => [
    { id: "student", header: "Student", accessorFn: (r) => r.student_name || r.student_id },
    { accessorKey: "plan_title", header: "Track" },
    { id: "day", header: "Day", accessorFn: (r) => (r.finished ? "Done" : `${Math.max(r.day_number, 1)}/${r.days_count || 30}`) },
    { id: "streak", header: "Streak (best)", accessorFn: (r) => `${r.current_streak} (${r.best_streak})` },
    { id: "pct", header: "Completion", accessorFn: (r) => `${r.completion_pct}%` },
    { id: "last", header: "Last active", accessorFn: (r) => when(r.last_active_at) },
    { accessorKey: "days_inactive", header: "Days inactive" },
    {
      id: "nudge", header: "", enableSorting: false,
      cell: ({ row }) => (
        <Button size="sm" variant="secondary" className="h-9 gap-1.5 rounded-lg" disabled={nudge.isPending || row.original.finished}
          onClick={(e) => { e.stopPropagation(); nudge.mutate(row.original); }}><BellRing className="h-4 w-4" aria-hidden /> Send nudge</Button>
      ),
    },
  ], [nudge]);

  const nudgeAll = async () => {
    const list = rows.data?.filter((r) => !r.finished) ?? [];
    if (!list.length) return;
    const res = await Promise.allSettled(list.map((r) => sendNudge(r.student_id, r.plan_id)));
    const ok = res.filter((x) => x.status === "fulfilled").length;
    toast[ok === list.length ? "success" : "error"](`${ok} of ${list.length} nudges sent`);
  };

  return (
    <div className="space-y-3">
      <Panel>
        <div className="grid gap-3 md:grid-cols-4">
          <select aria-label="Program" className={inputCls} value={program} onChange={(e) => { setProgram(e.target.value); setPlan(""); }}>
            <option value="">All programs</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select aria-label="Track" className={inputCls} value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="">All tracks</option>
            {plans.data?.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <select aria-label="Inactivity" className={inputCls} value={inactive} onChange={(e) => setInactive(Number(e.target.value))}>
            <option value={0}>Any activity</option>
            {[1, 2, 3, 5, 7, 14].map((n) => <option key={n} value={n}>Inactive ≥ {n} day{n > 1 ? "s" : ""}</option>)}
          </select>
          <Segmented<"asc" | "desc"> label="Sort by last active" value={order} onChange={setOrder} options={[{ value: "desc", label: "Newest" }, { value: "asc", label: "Stalest" }]} />
        </div>
        <div className="mt-3 flex justify-end">
          <Button variant="secondary" className="h-11 gap-1.5 rounded-xl" disabled={!rows.data?.length} onClick={nudgeAll}><BellRing className="h-4 w-4" aria-hidden /> Nudge all shown</Button>
        </div>
      </Panel>
      {rows.isError && <p role="alert" className="text-sm font-semibold text-destructive">{errMsg(rows.error)}</p>}
      <DataTable columns={columns} data={rows.data ?? []} loading={rows.isLoading} empty="No students on a track match these filters." csvName="habit-oversight" />
    </div>
  );
}
