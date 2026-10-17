// Phase 5 admin roster: who the admins are, their role and the programs they are limited to.
// Approval stays on the existing Admins page (people/admins); this page owns role + program access.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import DataTable from "@/shared/ui/DataTable";
import FilterBar from "@/shared/ui/FilterBar";
import { PageTitle, Panel } from "@/features/lectures/admin/components/kit";
import { getAdminCatalog } from "@/services/catalogServices";
import { useAuth } from "@/context/AuthContext";
import { errorText, listAdmins, listRoles, setAdminAccess, type AdminRole, type AdminRow } from "./api";
import AdminAccessSheet from "./AdminAccessSheet";

export default function AdminRosterPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isSuper = (user?.effective_role ?? "super_admin") === "super_admin"; // missing role == super_admin
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminRow | null>(null);

  const admins = useQuery({ queryKey: ["admin-roster"], queryFn: listAdmins });
  const roles = useQuery({ queryKey: ["admin-roles"], queryFn: listRoles, staleTime: 5 * 60_000 });
  const catalog = useQuery({ queryKey: ["admin-catalog"], queryFn: () => getAdminCatalog() });
  const programs = useMemo(() => (catalog.data?.programs ?? []).map((p) => ({ id: p.id as string, name: p.name })), [catalog.data]);
  const progName = (id: string) => programs.find((p) => p.id === id)?.name ?? id;
  const roleLabel = (r?: string) => roles.data?.find((x) => x.role === r)?.label ?? r ?? "Super admin";

  const save = useMutation({
    mutationFn: (v: { id: string; role: AdminRole; programIds: string[] }) => setAdminAccess(v.id, { role: v.role, program_ids: v.programIds }),
    onSuccess: async () => { toast.success("Access updated"); setEditing(null); await qc.invalidateQueries({ queryKey: ["admin-roster"] }); },
    onError: (e) => toast.error(errorText(e)), // includes the last-super-admin guard (409)
  });

  const rows = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (admins.data ?? []).filter((a) => !t || a.name?.toLowerCase().includes(t) || a.email?.toLowerCase().includes(t));
  }, [admins.data, search]);

  const columns = useMemo<ColumnDef<AdminRow, any>[]>(() => [
    { accessorKey: "name", header: "Name" },
    { accessorKey: "email", header: "Email" },
    { id: "role", header: "Role", accessorFn: (a) => roleLabel(a.effective_role) },
    {
      id: "programs", header: "Programs",
      accessorFn: (a) => ((a.effective_role ?? "super_admin") === "super_admin" || !a.program_ids?.length ? "All programs" : a.program_ids.map(progName).join(", ")),
    },
    { id: "status", header: "Status", accessorFn: (a) => (a.is_approved ? "Approved" : "Pending approval") },
    {
      id: "actions", header: "", enableSorting: false,
      cell: ({ row }) => (
        <Button size="sm" variant="secondary" disabled={!isSuper || !row.original.id} onClick={() => setEditing(row.original)}>Edit access</Button>
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [roles.data, programs, isSuper]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <PageTitle title="Admin roles" hint="Assign a role and limit admins to specific programs. A missing role counts as super admin." />
      {!isSuper && (
        <Panel><p className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4" aria-hidden /> Read-only: only a super admin can change roles and program access.</p></Panel>
      )}
      {admins.isError && <p className="text-sm text-red-600">{errorText(admins.error)}</p>}
      <FilterBar search={search} onSearch={setSearch} placeholder="Search admin…" />
      <DataTable<AdminRow> columns={columns} data={rows} loading={admins.isLoading} empty="No admins found." csvName="admin-roster" />
      <AdminAccessSheet
        admin={editing}
        roles={roles.data ?? []}
        programs={programs}
        saving={save.isPending}
        onClose={() => setEditing(null)}
        onSave={(id, role, programIds) => save.mutate({ id, role, programIds })}
      />
    </div>
  );
}
