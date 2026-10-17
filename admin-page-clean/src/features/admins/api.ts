// Phase 5 admin roster client: list admins, assign role + program access.
// Backend: GET /api/admin/ , GET /api/admin/roles , PUT /api/admin/:id/access (super_admin only).
import api from "@/services/api";

export type AdminRole = "super_admin" | "admin" | "analyst" | "support";

export interface AdminRow {
  id: string; name: string; email: string; is_approved?: boolean;
  role?: string; program_ids?: string[]; effective_role?: AdminRole;
}
export interface RoleInfo { role: AdminRole; label: string; description: string }

export const listAdmins = () => api.get("/api/admin/").then((r) => (r.data?.admins ?? []) as AdminRow[]);
export const listRoles = () => api.get("/api/admin/roles").then((r) => (r.data?.roles ?? []) as RoleInfo[]);

/** Fields left out stay unchanged. role "" resets to the legacy super_admin; program_ids [] clears the restriction. */
export const setAdminAccess = (id: string, body: { role?: string; program_ids?: string[] }) =>
  api.put(`/api/admin/${id}/access`, body).then((r) => r.data?.admin as AdminRow | undefined);

export const errorText = (e: unknown): string => {
  const r = (e as { response?: { status?: number; data?: { error?: string; message?: string } } })?.response;
  if (r?.status === 403) return "Only a super admin can change roles and program access.";
  return r?.data?.error ?? r?.data?.message ?? (e instanceof Error ? e.message : "Something went wrong");
};
