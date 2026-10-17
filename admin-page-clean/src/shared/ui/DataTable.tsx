// One table for Students, Questions, Assessments, Attempts and Payments (plan §7.3, D16):
// TanStack Table, server- or client-paged, column chooser and CSV export. Do not add MUI DataGrid.
import { useMemo, useState, type ReactNode } from "react";
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";

interface Props<T> {
  columns: ColumnDef<T, any>[];
  data: T[];
  loading?: boolean;
  empty?: ReactNode;
  /** Server paging: pass page + onPage + hasNext. Omit for a plain list. */
  page?: number; onPage?: (p: number) => void; hasNext?: boolean;
  /** CSV file name; the export button is hidden when omitted. */
  csvName?: string;
  onRowClick?: (row: T) => void;
}

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export default function DataTable<T>({ columns, data, loading, empty, page, onPage, hasNext, csvName, onRowClick }: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const table = useReactTable({
    data, columns, state: { sorting, columnVisibility: hidden },
    onSortingChange: setSorting, onColumnVisibilityChange: setHidden,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
  });

  const exportCsv = () => {
    const cols = table.getVisibleLeafColumns();
    const lines = [cols.map((c) => csvCell(typeof c.columnDef.header === "string" ? c.columnDef.header : c.id)).join(",")];
    for (const r of table.getRowModel().rows) lines.push(cols.map((c) => csvCell(r.getValue(c.id))).join(","));
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${csvName}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const chooser = useMemo(() => table.getAllLeafColumns().filter((c) => c.getCanHide()), [table, hidden]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-2 text-xs">
        <details className="relative">
          <summary className="cursor-pointer rounded-md border px-2 py-1">Columns</summary>
          <div className="absolute right-0 z-10 mt-1 w-44 rounded-md border bg-popover p-2 shadow">
            {chooser.map((c) => (
              <label key={c.id} className="flex items-center gap-2 py-0.5">
                <input type="checkbox" checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()} />
                {typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}
              </label>
            ))}
          </div>
        </details>
        {csvName && <button type="button" onClick={exportCsv} className="rounded-md border px-2 py-1">Export CSV</button>}
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="cursor-pointer select-none px-3 py-2 font-semibold" onClick={h.column.getToggleSortingHandler()}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {{ asc: " ▲", desc: " ▼" }[h.column.getIsSorted() as string] ?? ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={columns.length}>Loading…</td></tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={columns.length}>{empty ?? "Nothing to show"}</td></tr>
            ) : table.getRowModel().rows.map((r) => (
              <tr key={r.id} className={onRowClick ? "cursor-pointer border-t hover:bg-muted/40" : "border-t"} onClick={() => onRowClick?.(r.original)}>
                {r.getVisibleCells().map((c) => <td key={c.id} className="px-3 py-2">{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onPage && page !== undefined && (
        <div className="mt-2 flex items-center justify-end gap-2 text-xs">
          <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-md border px-2 py-1 disabled:opacity-50">Prev</button>
          <span>Page {page}</span>
          <button type="button" disabled={!hasNext} onClick={() => onPage(page + 1)} className="rounded-md border px-2 py-1 disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}
