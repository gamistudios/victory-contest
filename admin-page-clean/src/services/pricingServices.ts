import api from "./api";

export interface Money { currency: "ETB" | "XTR"; amount: number }
export interface PricePlan {
  id?: string; name: string; description: string; program_ids: string[]; all_programs: boolean;
  validity: { type: "days" | "fixed_end" | "lifetime"; days?: number; ends_at?: string };
  prices: Money[]; list_prices: Money[]; highlights: string[]; badge: string;
  is_active: boolean; visible_from: string; visible_until: string; sort_order: number;
}
export interface Coupon {
  id?: string; code: string; kind: "percent" | "fixed"; value: number;
  plan_ids: string[]; program_ids: string[]; max_redemptions: number; per_student_limit: number;
  redeemed?: number; starts_at: string; ends_at: string; is_active: boolean;
}

const B = "/api/pricing-admin";
export const listPlans = () => api.get(`${B}/plans`).then((r) => (r.data?.plans ?? []) as PricePlan[]);
export const savePlan = (p: PricePlan) =>
  (p.id ? api.put(`${B}/plans/${p.id}`, p) : api.post(`${B}/plans`, p)).then((r) => r.data as PricePlan);
export const deletePlan = (id: string) => api.delete(`${B}/plans/${id}`);
export const listCoupons = () => api.get(`${B}/coupons`).then((r) => (r.data?.coupons ?? []) as Coupon[]);
export const saveCoupon = (c: Coupon) =>
  (c.id ? api.put(`${B}/coupons/${c.id}`, c) : api.post(`${B}/coupons`, c)).then((r) => r.data as Coupon);
export const deleteCoupon = (id: string) => api.delete(`${B}/coupons/${id}`);
export const grantPlan = (student_id: string, plan_id: string) => api.post(`${B}/grant`, { student_id, plan_id }).then((r) => r.data);
export const revokePayment = (id: string) => api.post(`${B}/payments/${id}/revoke`);
export const rebuildEntitlements = (studentId: string) => api.post(`${B}/entitlements/${studentId}/rebuild`).then((r) => r.data);
export const studentEntitlements = (studentId: string) => api.get(`${B}/entitlements/${studentId}`).then((r) => r.data?.entitlements ?? []);

// Enrollment admin
const E = "/api/enrollment-admin";
export const adminEnrollments = (sid: string) => api.get(`${E}/students/${sid}`).then((r) => r.data);
export const adminEnroll = (sid: string, program_id: string, stream_id = "") => api.post(`${E}/students/${sid}`, { program_id, stream_id }).then((r) => r.data);
export const adminSetStream = (sid: string, pid: string, stream_id: string) => api.put(`${E}/students/${sid}/${pid}/stream`, { stream_id }).then((r) => r.data);
export const adminLeave = (sid: string, pid: string) => api.delete(`${E}/students/${sid}/${pid}`).then((r) => r.data);
export const bulkEnroll = (student_ids: string[], program_id: string, stream_id = "") => api.post(`${E}/bulk`, { student_ids, program_id, stream_id }).then((r) => r.data);

// Locations admin (plan §5.1)
export interface City { id: string; name: string; active: boolean }
export interface Region { id: string; name: string; active: boolean; sort_order: number; cities: City[] }
// `counts` is how many students stand on each entry, keyed "region:<id>" and
// "city:<id>", so a removal can say what it does before the admin clicks it.
export interface LocationsDoc { regions: Region[]; counts: Record<string, number> }
export const getLocations = () =>
  api.get("/api/locations-admin").then(
    (r): LocationsDoc => ({
      regions: (r.data?.regions ?? []) as Region[],
      counts: (r.data?.counts ?? {}) as Record<string, number>,
    }),
  );
export const saveLocations = (regions: Region[]) => api.put("/api/locations-admin", { regions }).then((r) => (r.data?.regions ?? []) as Region[]);

// Free-text ("Other") locations typed by students, clustered by canonical
// spelling: "Adis abeba", "Addis Ababa " and "A.A" arrive as ONE row that
// promotes as one. `known` means the typed name is a city the list already holds,
// so promoting links those students to it instead of adding a second entry.
export interface FreeTextLocation {
  key: string;
  region_id?: string;
  region: string;
  city_id?: string;
  city: string;
  known?: boolean;
  variants?: string[];
  count: number;
}
// Where a promote or merge actually landed the students.
export interface LocationTarget { region_id: string; region: string; city_id: string; city: string; merged?: boolean }
export const getFreeTextLocations = () => api.get("/api/locations-admin/free-text").then((r) => (r.data?.items ?? []) as FreeTextLocation[]);
export const promoteLocation = (b: { group_key: string; target_region_id?: string; new_region_name?: string; city_name?: string }) =>
  api.post("/api/locations-admin/promote", b).then((r) => r.data as { updated: number; failed: number; target?: LocationTarget; regions: Region[] });
// Fold one listed city into another, or drop a whole region: the entry leaves the
// list and the students on it either follow a target or are unlinked back to free
// text. No target means unlink — nobody is left pointing at a missing entry.
export interface RemoveTarget { kind: "region" | "city"; id: string; name: string }
export interface RemoveResult {
  moved: number;
  unlinked: number;
  failed: number;
  dropped: string;
  target?: LocationTarget;
  regions: Region[];
}
export const removeLocation = (b: { kind: RemoveTarget["kind"]; source_id: string; target_id?: string }) =>
  api.post("/api/locations-admin/remove", b).then((r) => r.data as RemoveResult);
