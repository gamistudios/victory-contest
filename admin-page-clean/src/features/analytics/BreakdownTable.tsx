// One sortable table for the program / stream / subject / region breakdowns (shared DataTable).
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/shared/ui/DataTable";
import type { AnalyticsBucket } from "./api";

export type BreakdownKind = "program" | "stream" | "subject" | "region";

interface Props {
  kind: BreakdownKind;
  rows: AnalyticsBucket[];
  loading?: boolean;
  /** id -> display name resolvers built from the catalog; fall back to the raw id. */
  names: { program: (id?: string) => string; stream: (id?: string) => string; subject: (id?: string) => string };
}

export default function BreakdownTable({ kind, rows, loading, names }: Props) {
  const columns = useMemo<ColumnDef<AnalyticsBucket, any>[]>(() => {
    const label: ColumnDef<AnalyticsBucket, any>[] =
      kind === "program" ? [{ id: "program", header: "Program", accessorFn: (b) => names.program(b.program_id ?? b.key) }]
      : kind === "stream" ? [
          { id: "program", header: "Program", accessorFn: (b) => names.program(b.program_id) },
          { id: "stream", header: "Stream", accessorFn: (b) => (b.stream_id ? names.stream(b.stream_id) : "No stream") },
        ]
      : kind === "subject" ? [
          { id: "program", header: "Program", accessorFn: (b) => names.program(b.program_id) },
          { id: "subject", header: "Subject", accessorFn: (b) => names.subject(b.subject_id ?? b.key) },
        ]
      : [{ id: "region", header: "Region", accessorFn: (b) => b.region || "Unknown" }];
    return [
      ...label,
      { accessorKey: "attempts", header: "Attempts" },
      { accessorKey: "students", header: "Students" },
      { id: "avg", header: "Avg %", accessorFn: (b) => b.avg_percent, cell: (c) => `${Number(c.getValue()).toFixed(1)}%` },
      { id: "pass", header: "Pass rate", accessorFn: (b) => b.pass_rate, cell: (c) => `${Number(c.getValue()).toFixed(1)}%` },
      { id: "pts", header: "Avg points", accessorFn: (b) => b.avg_points, cell: (c) => Number(c.getValue()).toFixed(1) },
    ];
  }, [kind, names]);

  return <DataTable<AnalyticsBucket> columns={columns} data={rows} loading={loading} empty="No finished attempts in this scope." />;
}
