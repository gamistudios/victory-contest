import { useSearchParams } from "react-router-dom";
import { getPrograms, getSubjects } from "@/services/academy/academyApi";
import type { LevelId, StreamId } from "@/types/academy";
import { useAsync } from "../hooks/useAsync";
import { useAcademy } from "../context/AcademyContext";
import { CardSkeleton, EmptyState, InlineError } from "../components/States";
import { SubjectTile } from "../components/SubjectTile";
import { iconFor, levelShort, STREAM_SHORT } from "../lib/theme";
import { cn } from "@/lib/utils";
import { BookOpen } from "lucide-react";

export default function Courses() {
  const { student } = useAcademy();
  const [sp, setSp] = useSearchParams();
  const level = (sp.get("level") as LevelId) || student?.level_id || "grade-12";
  const progs = useAsync(getPrograms, []);
  const prog = progs.data?.programs.find((p) => p.id === level);
  const streams = (prog?.available_streams ?? []).filter((s): s is StreamId => s !== "common");
  const stream = ((sp.get("stream") as StreamId) || (student && streams.includes(student.stream_id) ? student.stream_id : streams[0]) || "common") as StreamId;
  const subs = useAsync(() => getSubjects({ level_id: level, stream_id: stream }), [level, stream]);

  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); n.set(k, v); if (k === "level") n.delete("stream"); setSp(n, { replace: true }); };

  return (
    <div className="space-y-4 p-4">
      <div className="-mx-4 flex snap-x-start snap-start-child gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide" role="tablist" aria-label="Programs">
        {(progs.data?.programs ?? []).map((p) => {
          const Icon = iconFor(p.icon_name);
          const active = p.id === level;
          return (
            <button key={p.id} role="tab" aria-selected={active} disabled={!p.is_active} onClick={() => set("level", p.id)}
              className={cn("flex w-24 shrink-0 flex-col items-center gap-1.5 rounded-2xl border p-3 transition", active ? "border-brand bg-brand/15" : "border-border bg-card", !p.is_active && "opacity-40")}>
              <Icon className={cn("h-6 w-6", active ? "text-brand-ink" : "text-muted-foreground")} />
              <span className="text-xs font-bold">{levelShort(progs.data?.programs, p.id)}</span>
              <span className="text-[10px] text-muted-foreground">{p.is_active ? `${p.subjects_count} subjects` : "Soon"}</span>
            </button>
          );
        })}
      </div>

      {streams.length > 0 && (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Stream">
          {streams.map((s) => (
            <button key={s} role="tab" aria-selected={stream === s} onClick={() => set("stream", s)} className={cn("h-10 rounded-lg text-sm font-bold transition", stream === s ? "bg-card shadow-sm" : "text-muted-foreground")}>
              {STREAM_SHORT[s]}
            </button>
          ))}
        </div>
      )}

      {subs.error ? <InlineError message={subs.error} onRetry={subs.reload} /> : subs.loading && !subs.data ? (
        <div className="grid grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} className="h-36" />)}</div>
      ) : subs.data && subs.data.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">{subs.data.map((s) => <SubjectTile key={s.id} subject={s} />)}</div>
      ) : (
        <EmptyState icon={<BookOpen className="h-6 w-6" />} title="Courses coming soon" hint="This program has no published subjects yet." />
      )}
    </div>
  );
}
