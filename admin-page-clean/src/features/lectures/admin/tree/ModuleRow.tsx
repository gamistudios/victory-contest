import { ArrowDown, ArrowUp, CheckCircle2, Copy, FileText, FilePen, Layers, ListChecks, MoreVertical, Pencil, Trash2, Video } from "lucide-react";
import { Link } from "react-router-dom";
import { AccessBadge } from "@/features/lectures/components/AccessBadge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { fmtMinutes } from "@/features/lectures/lib/theme";
import { ADMIN_BASE, StatusPill } from "../components/kit";
import type { TreeModule } from "./types";

function Res({ icon: Icon, on, n, label }: { icon: typeof Video; on: boolean; n?: number; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", on ? "text-foreground" : "text-muted-foreground/60")} title={`${label}${n !== undefined ? ` (${n})` : ""}`}>
      <Icon className="h-4 w-4" aria-hidden />
      {n !== undefined && <span>{n}</span>}
      <span className="sr-only">{on ? `${label}${n !== undefined ? ` ${n}` : ""}` : `No ${label}`}</span>
    </span>
  );
}

export interface ModuleRowActions {
  onToggleAccess: (m: TreeModule) => void;
  onTogglePublish: (m: TreeModule) => void;
  onDuplicate: (m: TreeModule) => void;
  onDelete: (m: TreeModule) => void;
  onMove: (m: TreeModule, dir: "up" | "down") => void;
}

export function ModuleRow({ m, first, last, actions }: { m: TreeModule; first: boolean; last: boolean; actions: ModuleRowActions }) {
  const to = `${ADMIN_BASE}/module/${m.id}`;
  const published = m.publish_status === "published";
  return (
    <li className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link to={to} className="line-clamp-2 text-sm font-bold text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {m.title}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {m.difficulty} · {fmtMinutes(m.estimated_minutes)}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`Actions for ${m.title}`} className="-mr-1 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <MoreVertical className="h-5 w-5" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild className="min-h-11 gap-2">
              <Link to={to}>
                <Pencil className="h-4 w-4" aria-hidden /> Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => actions.onDuplicate(m)}>
              <Copy className="h-4 w-4" aria-hidden /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11 gap-2" onSelect={() => actions.onTogglePublish(m)}>
              {published ? <FilePen className="h-4 w-4" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
              {published ? "Unpublish" : "Publish"}
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11 gap-2" disabled={first} onSelect={() => actions.onMove(m, "up")}>
              <ArrowUp className="h-4 w-4" aria-hidden /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11 gap-2" disabled={last} onSelect={() => actions.onMove(m, "down")}>
              <ArrowDown className="h-4 w-4" aria-hidden /> Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-11 gap-2 text-destructive focus:text-destructive" onSelect={() => actions.onDelete(m)}>
              <Trash2 className="h-4 w-4" aria-hidden /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusPill status={m.publish_status} />
        <button
          type="button"
          onClick={() => actions.onToggleAccess(m)}
          aria-label={`${m.access_status === "free" ? "Free" : "Premium"} — tap to make ${m.access_status === "free" ? "premium" : "free"}`}
          className="-my-1 inline-flex min-h-11 min-w-11 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AccessBadge access={m.access_status} />
        </button>
        <span className="ml-auto flex items-center gap-3" aria-label="Resources">
          <Res icon={Video} on={m.has_video} label="Video" />
          <Res icon={FileText} on={m.documents > 0} n={m.documents} label="Documents" />
          <Res icon={Layers} on={m.flashcards > 0} n={m.flashcards} label="Flashcards" />
          <Res icon={ListChecks} on={m.questions > 0} n={m.questions} label="Quiz questions" />
        </span>
      </div>
    </li>
  );
}
