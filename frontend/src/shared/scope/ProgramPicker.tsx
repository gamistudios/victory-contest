import { Check, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { groupPrograms, needsStreamChoice, type Catalog, type CatalogProgram } from "./catalog";

/** Program cards grouped by `group` (registration step 2). Everything comes from the catalog. */
export function ProgramPicker({ programs, value, onChange }: { programs: CatalogProgram[]; value: string; onChange: (p: CatalogProgram) => void }) {
  return (
    <div className="space-y-4" role="radiogroup" aria-label="Program">
      {groupPrograms(programs).map((g) => (
        <section key={g.group} className="space-y-2">
          <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">{g.group}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {g.programs.map((p) => {
              const active = p.id === value;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange(p)}
                  className={cn(
                    "flex min-h-[64px] items-center gap-3 rounded-2xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "border-blue-fix-600 bg-blue-100" : "border-border bg-card hover:bg-muted/50",
                  )}
                >
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", active ? "bg-blue-fix-600 text-white" : "bg-muted text-muted-foreground")}>
                    {active ? <Check className="h-5 w-5" aria-hidden /> : <GraduationCap className="h-5 w-5" aria-hidden />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold">{p.name}</span>
                    {p.description && <span className="block truncate text-xs text-muted-foreground">{p.description}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Stream choice (registration step 3): only the streams the program offers. */
export function StreamPicker({ catalog, program, value, onChange }: { catalog: Catalog; program: CatalogProgram; value: string; onChange: (id: string) => void }) {
  if (!needsStreamChoice(program)) return <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">This program is the same for every stream — nothing to choose.</p>;
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Stream">
      {program.available_streams.filter((s) => s !== "common").map((s) => {
        const st = catalog.streams.find((x) => x.id === s);
        const active = value === s;
        return (
          <button key={s} type="button" role="radio" aria-checked={active} onClick={() => onChange(s)}
            className={cn("flex min-h-[72px] flex-col items-start justify-center rounded-2xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "border-blue-fix-600 bg-blue-100" : "border-border bg-card hover:bg-muted/50")}>
            <span className="text-sm font-extrabold">{st?.name ?? s}</span>
          </button>
        );
      })}
    </div>
  );
}
