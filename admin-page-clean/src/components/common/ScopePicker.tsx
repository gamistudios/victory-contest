import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAdminCatalog, type AdminCatalog } from "@/services/catalogServices";
import type { Scope } from "@/types/models";

const NONE = "__none__";

/**
 * One picker for "which program / stream / subject / chapter does this belong to"
 * (plan §5.2). Everything comes from the catalog; "common" is always a valid stream.
 * `value === undefined` means unscoped (legacy behaviour).
 */
export function ScopePicker({ value, onChange, disabled, depth = "subject" }: { value?: Scope; onChange: (s: Scope | undefined) => void; disabled?: boolean; depth?: "stream" | "subject" | "chapter" }) {
  const [cat, setCat] = useState<AdminCatalog | null>(null);
  useEffect(() => {
    getAdminCatalog().then(setCat).catch(() => setCat(null));
  }, []);

  const programs = useMemo(() => (cat?.programs ?? []).filter((p) => p.is_active || p.id === value?.program_id), [cat, value?.program_id]);
  const program = programs.find((p) => p.id === value?.program_id);
  const streams = useMemo(() => {
    const offered = (program?.available_streams ?? []).filter((s) => s !== "common");
    return (cat?.streams ?? []).filter((s) => s.id === "common" || offered.includes(s.id));
  }, [cat, program]);
  const subjects = useMemo(
    () => (cat?.subjects ?? []).filter((s) => s.level_id === value?.program_id && (value?.stream_id === "common" || s.stream_id === value?.stream_id || s.stream_id === "common")),
    [cat, value?.program_id, value?.stream_id],
  );
  const chapters = useMemo(() => (cat?.chapters ?? []).filter((c) => c.subject_id === value?.subject_id), [cat, value?.subject_id]);

  const field = (label: string, node: React.ReactNode) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      {node}
    </div>
  );

  return (
    <div className="space-y-4">
      {field(
        "Program",
        <Select
          disabled={disabled}
          value={value?.program_id ?? NONE}
          onValueChange={(id) => (id === NONE ? onChange(undefined) : onChange({ program_id: id, stream_id: "common" }))}
        >
          <SelectTrigger><SelectValue placeholder="Any program" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Any program (unscoped)</SelectItem>
            {programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>,
      )}
      {value &&
        field(
          "Stream",
          <Select disabled={disabled} value={value.stream_id} onValueChange={(id) => onChange({ program_id: value.program_id, stream_id: id })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {streams.map((s) => <SelectItem key={s.id} value={s.id}>{s.id === "common" ? "Common (all streams)" : s.name}</SelectItem>)}
            </SelectContent>
          </Select>,
        )}
      {value && depth !== "stream" && subjects.length > 0 &&
        field(
          "Subject",
          <Select disabled={disabled} value={value.subject_id ?? NONE} onValueChange={(id) => onChange({ program_id: value.program_id, stream_id: value.stream_id, subject_id: id === NONE ? undefined : id })}>
            <SelectTrigger><SelectValue placeholder="Any subject" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Any subject</SelectItem>
              {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>,
        )}
      {value?.subject_id && depth === "chapter" && chapters.length > 0 &&
        field(
          "Chapter",
          <Select disabled={disabled} value={value.chapter_id ?? NONE} onValueChange={(id) => onChange({ ...value, chapter_id: id === NONE ? undefined : id })}>
            <SelectTrigger><SelectValue placeholder="Any chapter" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Any chapter</SelectItem>
              {chapters.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
            </SelectContent>
          </Select>,
        )}
    </div>
  );
}
