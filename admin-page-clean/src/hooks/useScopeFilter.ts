import { useEffect, useState } from "react";
import { getAdminCatalog } from "@/services/catalogServices";

export interface ScopeFilterState { programs: string[]; kinds: string[] }
export const emptyScopeFilter: ScopeFilterState = { programs: [], kinds: [] };

/** Program options for scope-based list filters, read from /api/catalog (plan §6.2). */
export function useScopeFilterOptions() {
  const [programs, setPrograms] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let alive = true;
    getAdminCatalog().then((c) => {
      if (alive) setPrograms((c.programs ?? []).map((p: any) => ({ id: p.id, name: p.name })));
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return { programs, kinds: ["contest", "practice", "entrance", "past_exam", "makeup", "other"] };
}

/** True when a contest passes the scope filter (empty filter = everything). */
export const matchesScopeFilter = (
  c: { scope?: { program_id?: string }; kind?: string },
  f: ScopeFilterState,
) =>
  (f.programs.length === 0 || (!!c.scope?.program_id && f.programs.includes(c.scope.program_id))) &&
  (f.kinds.length === 0 || f.kinds.includes(c.kind ?? "contest"));
