// Phase 5 revenue report: revenue by month / program / plan / coupon in whole ETB birr, with CSV.
// Refunds, free grants and Telegram Stars are shown apart from ETB revenue.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Banknote, Download, Gift, RotateCcw, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import DataTable from "@/shared/ui/DataTable";
import { PageTitle, Panel, PanelTitle, Segmented, StatTile, inputCls } from "@/features/lectures/admin/components/kit";
import { getAdminCatalog } from "@/services/catalogServices";
import { errorText, exportRevenueCsv, getRevenueReport, type RevenueGroup, type RevenueParams, type RevenueRow } from "./api";

// All money is whole ETB birr (integers; no sub-units).
const birr = (n: number) => `${Math.round(n).toLocaleString(undefined, { maximumFractionDigits: 0 })} ETB`;

const GROUPS: { value: RevenueGroup; label: string }[] = [
  { value: "month", label: "By month" },
  { value: "program", label: "By program" },
  { value: "plan", label: "By plan" },
  { value: "coupon", label: "By coupon" },
];

export default function RevenueReportPage() {
  const [group, setGroup] = useState<RevenueGroup>("month");
  const [program, setProgram] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);

  const catalog = useQuery({ queryKey: ["admin-catalog"], queryFn: () => getAdminCatalog() });
  const programs = catalog.data?.programs ?? [];

  const params: RevenueParams = useMemo(() => ({ program_id: program ? [program] : undefined, from: from || undefined, to: to || undefined }), [program, from, to]);
  const dateBad = !!from && !!to && from > to;
  const q = useQuery({ queryKey: ["revenue-report", params], queryFn: () => getRevenueReport(params), enabled: !dateBad });
  const r = q.data;

  const columns = useMemo<ColumnDef<RevenueRow, any>[]>(() => [
    { id: "label", header: group === "month" ? "Month" : group === "program" ? "Program" : group === "plan" ? "Plan" : "Coupon", accessorFn: (x) => x.label || x.key },
    { accessorKey: "payments", header: "Payments" },
    { id: "revenue", header: "Revenue (ETB)", accessorFn: (x) => x.revenue_etb, cell: (c) => birr(Number(c.getValue())) },
  ], [group]);

  const rows = r ? (group === "month" ? r.by_month : group === "program" ? r.by_program : group === "plan" ? r.by_plan : r.by_coupon) : [];

  const doExport = async () => {
    setExporting(true);
    try { await exportRevenueCsv(group, params); } catch (e) { toast.error(errorText(e)); } finally { setExporting(false); }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <PageTitle
        title="Revenue report"
        hint="Approved payments by approval date (Addis Ababa time). Bundle prices are split across their programs in whole birr."
        action={<Button variant="secondary" className="h-11 gap-1.5 rounded-xl" onClick={doExport} disabled={exporting || dateBad}><Download className="h-4 w-4" aria-hidden /> {exporting ? "Exporting…" : "Export CSV"}</Button>}
      />
      <Panel>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold text-muted-foreground">Program
            <select className={inputCls} value={program} onChange={(e) => setProgram(e.target.value)}>
              <option value="">All programs</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted-foreground">From<input type="date" className={inputCls} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-xs font-semibold text-muted-foreground">To<input type="date" className={inputCls} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        {dateBad && <p className="mt-2 text-sm text-red-600">“From” must not be after “To”.</p>}
      </Panel>

      {q.isError && <Panel><p className="text-sm text-red-600">{errorText(q.error)}</p></Panel>}
      {q.isLoading && <Skeleton className="h-40 w-full rounded-2xl" />}

      {r && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile icon={Banknote} label="Revenue" value={birr(r.totals.revenue_etb)} sub={`${r.totals.payments} payments`} tone="bg-emerald-100 text-emerald-700" />
            <StatTile icon={RotateCcw} label="Refunded" value={birr(r.totals.refunded_etb)} sub={`${r.totals.refunded} revoked · not in revenue`} tone="bg-rose-100 text-rose-700" />
            <StatTile icon={Gift} label="Free grants" value={r.totals.free_grants.toLocaleString()} sub="no money moved" tone="bg-violet-100 text-violet-700" />
            <StatTile icon={Star} label="Telegram Stars" value={`${r.totals.stars_revenue_xtr.toLocaleString()} ★`} sub="reported apart from ETB" tone="bg-amber-100 text-amber-700" />
          </div>
          <div className="overflow-x-auto">
            <Segmented<RevenueGroup> label="Group revenue by" value={group} onChange={setGroup} options={GROUPS} />
          </div>
          <Panel>
            <PanelTitle>{GROUPS.find((g) => g.value === group)?.label}</PanelTitle>
            <DataTable<RevenueRow> columns={columns} data={rows} empty="No approved payments in this range." csvName={`revenue-by-${group}`} />
            {r.totals.legacy_payments > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">{r.totals.legacy_payments} older payment(s) predate plan snapshots and are valued from the transfer amount, rounded to whole birr.</p>
            )}
          </Panel>
          <p className="text-right text-[11px] text-muted-foreground">Generated {new Date(r.generated_at).toLocaleString()}</p>
        </>
      )}
    </div>
  );
}
