// Phase 1 catalog layer (plan §5.1, §6.2): ONE place that knows the shape of
// GET /api/catalog. Every program/stream/subject/region dropdown must read from
// useCatalog(); no component may hardcode a program id, grade or region list.
import { useEffect, useState } from "react";
import api from "@/services/api";

export interface CatalogProgram {
  id: string;
  name: string;
  short_code: string;
  description: string;
  icon_name: string;
  available_streams: string[];
  kind?: string;
  group?: string;
  features?: string[];
  grade?: string;
  sort_order: number;
  open_for_registration: boolean;
  is_active: boolean;
}

export interface CatalogStream {
  id: string;
  name: string;
}

export interface CatalogCity {
  id: string;
  name: string;
  active: boolean;
}

export interface CatalogRegion {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
  cities: CatalogCity[];
}

export interface Catalog {
  programs: CatalogProgram[];
  streams: CatalogStream[];
  locations: { regions: CatalogRegion[] };
}

export const COMMON_STREAM = "common";

/** A student must pick natural/social only when the program offers a non-common stream. */
export function needsStreamChoice(p?: Pick<CatalogProgram, "available_streams">): boolean {
  return !!p && p.available_streams.some((s) => s !== COMMON_STREAM);
}

/** Programs shown in the registration form, grouped by `group` in sort order. */
export function registrationPrograms(c: Catalog | null): CatalogProgram[] {
  return (c?.programs ?? [])
    .filter((p) => p.is_active && p.open_for_registration)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function groupPrograms(programs: CatalogProgram[]): { group: string; programs: CatalogProgram[] }[] {
  const out: { group: string; programs: CatalogProgram[] }[] = [];
  for (const p of programs) {
    const group = p.group || "Other";
    let bucket = out.find((g) => g.group === group);
    if (!bucket) {
      bucket = { group, programs: [] };
      out.push(bucket);
    }
    bucket.programs.push(p);
  }
  return out;
}

let cached: Promise<Catalog> | null = null;

/** Fetched once per page load; a failed fetch is not cached so it can retry. */
export function loadCatalog(): Promise<Catalog> {
  if (!cached) {
    cached = api
      .get<Catalog>("/catalog")
      .then((r) => r.data)
      .catch((e) => {
        cached = null;
        throw e;
      });
  }
  return cached;
}

export function useCatalog(): { catalog: Catalog | null; loading: boolean; error: boolean } {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    loadCatalog()
      .then((c) => alive && setCatalog(c))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);
  return { catalog, loading, error };
}
