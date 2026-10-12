import { ArrowDown, ArrowUp, Lock, Unlock, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ADMIN_BASE, IconBtn } from "../components/kit";
import { ModuleRow, type ModuleRowActions } from "./ModuleRow";
import type { TreeChapter } from "./types";

export interface ChapterActions {
  onTogglePremium: (c: TreeChapter) => void;
  onMove: (c: TreeChapter, dir: "up" | "down") => void;
  onEdit: (c: TreeChapter) => void;
  onDelete: (c: TreeChapter) => void;
}

export function ChapterBlock({ chapter, index, count, chapterActions, moduleActions }: { chapter: TreeChapter; index: number; count: number; chapterActions: ChapterActions; moduleActions: ModuleRowActions }) {
  const c = chapter;
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-2.5">
      <div className="flex items-center gap-1.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card text-xs font-extrabold text-foreground">{index + 1}</span>
        <h3 className="min-w-0 flex-1 truncate px-1 text-sm font-bold text-foreground">{c.title}</h3>
        <button
          type="button"
          role="switch"
          aria-checked={c.is_premium}
          aria-label={`Premium lock for chapter ${c.title}`}
          onClick={() => chapterActions.onTogglePremium(c)}
          className={cn(
            "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            c.is_premium ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800",
          )}
        >
          {c.is_premium ? <Lock className="h-4 w-4" aria-hidden /> : <Unlock className="h-4 w-4" aria-hidden />}
          {c.is_premium ? "Premium" : "Free"}
        </button>
        <span className="hidden sm:flex">
          <IconBtn label="Move chapter up" icon={ArrowUp} tone="ghost" disabled={index === 0} onClick={() => chapterActions.onMove(c, "up")} />
          <IconBtn label="Move chapter down" icon={ArrowDown} tone="ghost" disabled={index === count - 1} onClick={() => chapterActions.onMove(c, "down")} />
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`Actions for chapter ${c.title}`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <MoreVertical className="h-5 w-5" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild className="min-h-11 gap-2">
              <Link to={`${ADMIN_BASE}/module/new?chapter=${c.id}`}>
                <Plus className="h-4 w-4" aria-hidden /> Add module
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => chapterActions.onEdit(c)}>
              <Pencil className="h-4 w-4" aria-hidden /> Edit chapter
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11 gap-2 sm:hidden" disabled={index === 0} onSelect={() => chapterActions.onMove(c, "up")}>
              <ArrowUp className="h-4 w-4" aria-hidden /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11 gap-2 sm:hidden" disabled={index === count - 1} onSelect={() => chapterActions.onMove(c, "down")}>
              <ArrowDown className="h-4 w-4" aria-hidden /> Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-11 gap-2 text-destructive focus:text-destructive" onSelect={() => chapterActions.onDelete(c)}>
              <Trash2 className="h-4 w-4" aria-hidden /> Delete chapter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ul className="mt-2 space-y-2">
        {c.modules.map((m, i) => (
          <ModuleRow key={m.id} m={m} first={i === 0} last={i === c.modules.length - 1} actions={moduleActions} />
        ))}
      </ul>
      <Link
        to={`${ADMIN_BASE}/module/new?chapter=${c.id}`}
        className="mt-2 flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="h-4 w-4" aria-hidden /> Add module
      </Link>
    </div>
  );
}
