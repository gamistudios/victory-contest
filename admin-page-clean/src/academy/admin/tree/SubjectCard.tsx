import { ChevronDown, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { iconFor, LEVEL_SHORT, STREAM_SHORT, toneFor } from "@/academy/lib/theme";
import { cn } from "@/lib/utils";
import { ChapterBlock, type ChapterActions } from "./ChapterBlock";
import type { ModuleRowActions } from "./ModuleRow";
import type { TreeSubject } from "./types";

export function SubjectCard({ subject, open, onToggle, onAddChapter, chapterActions, moduleActions }: { subject: TreeSubject; open: boolean; onToggle: () => void; onAddChapter: () => void; chapterActions: ChapterActions; moduleActions: ModuleRowActions }) {
  const tone = toneFor(subject.color_theme);
  const Icon = iconFor(subject.icon_name);
  const mods = subject.chapters.reduce((n, c) => n + c.modules.length, 0);
  const published = subject.chapters.reduce((n, c) => n + c.modules.filter((m) => m.publish_status === "published").length, 0);
  const panelId = `subject-${subject.id}`;
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panelId} className="flex min-h-[72px] w-full items-center gap-3 p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", tone.solid)}>
          <Icon className="h-6 w-6" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-extrabold text-foreground">{subject.name}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
            <span className={cn("rounded-full px-2 py-0.5", tone.soft)}>{LEVEL_SHORT[subject.level_id]}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{STREAM_SHORT[subject.stream_id]}</span>
            <span className="text-muted-foreground">
              {subject.chapters.length} ch · {published}/{mods} live
            </span>
          </span>
        </span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id={panelId} className="space-y-2.5 border-t border-border p-3">
          {subject.chapters.map((c, i) => (
            <ChapterBlock key={c.id} chapter={c} index={i} count={subject.chapters.length} chapterActions={chapterActions} moduleActions={moduleActions} />
          ))}
          <Button variant="outline" className="h-11 w-full border-dashed" onClick={onAddChapter}>
            <FolderPlus className="h-4 w-4" aria-hidden /> Add chapter
          </Button>
        </div>
      )}
    </section>
  );
}
