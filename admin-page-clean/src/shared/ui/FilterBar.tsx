import type { ReactNode } from "react";

/** Search box + slot for page-specific filters; every table page uses the same bar. */
export default function FilterBar({ search, onSearch, placeholder = "Search…", children }: {
  search: string; onSearch: (v: string) => void; placeholder?: string; children?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder}
        className="h-9 min-w-[12rem] flex-1 rounded-md border bg-background px-3 text-sm" aria-label="Search" />
      {children}
    </div>
  );
}
