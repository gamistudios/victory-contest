import { useEffect, useState } from "react";
import { getAdminCatalog } from "@/services/catalogServices";
import { grades as FALLBACK_GRADES, Subjects as FALLBACK_SUBJECTS } from "@/components/questions/Data";

export interface CatalogLists {
  /** Grades that at least one active program is tied to (e.g. "9".."12"). */
  grades: string[];
  /** Distinct subject names from the catalog. Capitalised to match the old constant so existing JSX keeps working. */
  Subjects: string[];
  /** Active city names from the managed locations list. */
  cities: string[];
  ready: boolean;
}

const uniq = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = x.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * Grade, subject and city lists from /api/catalog (plan §5.1, D10).
 * The old hardcoded constants are only the fallback while the catalog loads or when it is empty.
 */
export function useCatalogLists(): CatalogLists {
  const [lists, setLists] = useState<CatalogLists>({ grades: FALLBACK_GRADES, Subjects: FALLBACK_SUBJECTS, cities: [], ready: false });

  useEffect(() => {
    let alive = true;
    getAdminCatalog()
      .then((c) => {
        if (!alive) return;
        const grades = uniq((c.programs ?? []).map((p) => String(p.grade ?? ""))).sort((a, b) => Number(a) - Number(b));
        const subjects = uniq((c.subjects ?? []).map((s) => s.name));
        const cities = uniq((c.locations?.regions ?? []).flatMap((r) => r.cities.filter((x) => x.active).map((x) => x.name))).sort();
        setLists({
          grades: grades.length ? grades : FALLBACK_GRADES,
          Subjects: subjects.length ? subjects : FALLBACK_SUBJECTS,
          cities,
          ready: true,
        });
      })
      .catch(() => alive && setLists((l) => ({ ...l, ready: true })));
    return () => {
      alive = false;
    };
  }, []);

  return lists;
}
