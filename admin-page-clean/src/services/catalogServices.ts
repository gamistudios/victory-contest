import api from "./api";
import type { Program, Stream } from "@/types/academy";
import type { Region } from "./pricingServices";

/** Public, cacheable catalog (programs, streams, locations): the single source for every admin filter and picker. */
export interface AdminCatalog {
  programs: Program[];
  streams: Stream[];
  locations: { regions: Region[] };
  subjects?: CatalogSubject[];
  chapters?: CatalogChapter[];
}

let cache: Promise<AdminCatalog> | null = null;
export const getAdminCatalog = (force = false): Promise<AdminCatalog> => {
  if (!cache || force) cache = api.get("/api/catalog").then((r) => r.data as AdminCatalog);
  cache.catch(() => (cache = null));
  return cache;
};

export interface CatalogSubject { id: string; name: string; level_id: string; stream_id: string }
export interface CatalogChapter { id: string; subject_id: string; title: string }
