import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /**
   * Optional toolbar rendered above the table. It is wrapped in a
   * flex-wrap container with row gap so search inputs and buttons stack
   * vertically on narrow screens instead of overflowing.
   */
  toolbar?: React.ReactNode;
  /** Opt-in client-side pagination (backward compatible: off by default). */
  enablePagination?: boolean;
  /** Page size used when `enablePagination` is on. */
  initialPageSize?: number;
  /** Tailwind classes for page-size choices when `enablePagination` is on. */
  pageSizeOptions?: number[];
  /**
   * min-width utility applied to the <table> so wide tables scroll
   * horizontally on phones instead of crushing their columns.
   */
  tableClassName?: string;
}

/**
 * Reads an optional responsive class from a column definition's `meta`
 * (`meta: { class: "hidden sm:table-cell" }` for cells,
 *  `meta: { headClass: ... }` for the header, falling back to `class`).
 * This lets pages hide low-value columns on small screens while keeping
 * the data reachable through wider viewports.
 */
function metaClass(
  meta: unknown,
  key: "class" | "headClass"
): string | undefined {
  if (meta && typeof meta === "object" && key in meta) {
    const value = (meta as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  toolbar,
  enablePagination = false,
  initialPageSize = 10,
  pageSizeOptions = [10, 20, 30, 50],
  tableClassName = "min-w-[640px]",
}: DataTableProps<TData, TValue>) {
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(initialPageSize);

  const pageCount = Math.max(1, Math.ceil(data.length / pageSize));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);

  const viewData = enablePagination
    ? data.slice(safePageIndex * pageSize, safePageIndex * pageSize + pageSize)
    : data;

  const table = useReactTable({
    data: viewData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="rounded-md border">
      {toolbar !== undefined && toolbar !== null && (
        <div className="flex flex-wrap items-center gap-2 gap-y-3 border-b p-2 sm:p-4">
          {toolbar}
        </div>
      )}
      <Table className={tableClassName}>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead
                    key={header.id}
                    className={
                      metaClass(header.column.columnDef.meta, "headClass") ??
                      metaClass(header.column.columnDef.meta, "class")
                    }
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={metaClass(cell.column.columnDef.meta, "class")}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {enablePagination && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t px-2 py-3 sm:px-4">
          <p className="order-1 text-sm text-muted-foreground sm:flex-1">
            {data.length} total rows
          </p>
          <div className="order-3 flex w-full items-center justify-between gap-3 sm:order-2 sm:justify-end sm:gap-6 lg:gap-8 sm:w-auto">
            {/* Rows-per-page control is hidden on phones where it crushed
                the bar; the compact "N rows" label above still informs. */}
            <div className="hidden items-center gap-2 sm:flex">
              <p className="text-sm font-medium">Rows per page</p>
              <Select
                value={`${pageSize}`}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPageIndex(0);
                }}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue placeholder={pageSize} />
                </SelectTrigger>
                <SelectContent side="top">
                  {pageSizeOptions.map((size) => (
                    <SelectItem key={size} value={`${size}`}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs font-medium text-muted-foreground sm:text-sm sm:text-foreground">
              Page {safePageIndex + 1} / {pageCount}
            </p>
            <div className="flex items-center gap-1 sm:gap-2">
              <Button
                variant="outline"
                className="hidden h-8 w-8 p-0 sm:inline-flex"
                onClick={() => setPageIndex(0)}
                disabled={safePageIndex === 0}
                aria-label="First page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => setPageIndex(Math.max(0, safePageIndex - 1))}
                disabled={safePageIndex === 0}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() =>
                  setPageIndex(Math.min(pageCount - 1, safePageIndex + 1))
                }
                disabled={safePageIndex >= pageCount - 1}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="hidden h-8 w-8 p-0 sm:inline-flex"
                onClick={() => setPageIndex(pageCount - 1)}
                disabled={safePageIndex >= pageCount - 1}
                aria-label="Last page"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
