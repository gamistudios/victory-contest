// Edit one admin's role + program assignment (opens from the roster).
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip, Field, FormSheet } from "@/features/lectures/admin/components/kit";
import type { AdminRole, AdminRow, RoleInfo } from "./api";

interface Props {
  admin: AdminRow | null;
  roles: RoleInfo[];
  programs: { id: string; name: string }[];
  saving: boolean;
  onClose: () => void;
  onSave: (id: string, role: AdminRole, programIds: string[]) => void;
}

const toggle = <T,>(l: T[], v: T) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);

export default function AdminAccessSheet({ admin, roles, programs, saving, onClose, onSave }: Props) {
  const [role, setRole] = useState<AdminRole>("super_admin");
  const [programIds, setProgramIds] = useState<string[]>([]);
  useEffect(() => {
    if (!admin) return;
    setRole((admin.effective_role ?? "super_admin") as AdminRole);
    setProgramIds(admin.program_ids ?? []);
  }, [admin]);

  const info = roles.find((r) => r.role === role);
  const isSuper = role === "super_admin";
  return (
    <FormSheet
      open={!!admin}
      onOpenChange={(o) => !o && onClose()}
      title={admin ? `Access · ${admin.name || admin.email}` : "Access"}
      description={admin?.email}
      footer={
        <>
          <Button variant="secondary" className="h-11 flex-1 rounded-xl" onClick={onClose}>Cancel</Button>
          <Button className="h-11 flex-1 rounded-xl" disabled={saving || !admin} onClick={() => admin && onSave(admin.id, role, isSuper ? [] : programIds)}>{saving ? "Saving…" : "Save access"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Role" hint={info?.description}>
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => <Chip key={r.role} active={role === r.role} onClick={() => setRole(r.role)}>{r.label}</Chip>)}
          </div>
        </Field>
        <Field
          label="Programs"
          hint={isSuper ? "Super admins always have every program." : "None selected = every program. Select some to limit this admin to them."}
        >
          <div className={isSuper ? "pointer-events-none flex flex-wrap gap-2 opacity-50" : "flex flex-wrap gap-2"}>
            {programs.map((p) => <Chip key={p.id} active={!isSuper && programIds.includes(p.id)} onClick={() => setProgramIds(toggle(programIds, p.id))}>{p.name}</Chip>)}
          </div>
        </Field>
      </div>
    </FormSheet>
  );
}
