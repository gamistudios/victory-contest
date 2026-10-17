import { useEffect, useState } from "react";
import { useScope } from "@/app/ProgramContext";
import { getAdminCatalog } from "@/services/catalogServices";

interface P { id: string; name: string; available_streams?: string[] }

/** Header switcher: "Working in: Grade 12 · Natural ▾" with an "All programs" option. */
export default function ProgramSwitcher() {
  const { program, stream, setScope } = useScope();
  const [programs, setPrograms] = useState<P[]>([]);
  useEffect(() => {
    let alive = true;
    getAdminCatalog().then((c: any) => alive && setPrograms(c.programs ?? [])).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const current = programs.find((p) => p.id === program);
  const streams = (current?.available_streams ?? []).filter((s) => s !== "common");
  const cls = "h-9 rounded-md border bg-background px-2 text-sm";
  return (
    <div className="hidden items-center gap-2 md:flex" aria-label="Working program">
      <span className="text-xs text-muted-foreground">Working in</span>
      <select className={cls} value={program} onChange={(e) => setScope({ program: e.target.value })} aria-label="Program">
        <option value="">All programs</option>
        {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {streams.length > 0 && (
        <select className={cls} value={stream} onChange={(e) => setScope({ stream: e.target.value })} aria-label="Stream">
          <option value="">All streams</option>
          {streams.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
    </div>
  );
}
