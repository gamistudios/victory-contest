import { useMemo, useState } from "react";
import { Plus, Library } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, InlineError } from "@/academy/components/States";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAsync } from "@/academy/hooks/useAsync";
import { LEVEL_SHORT } from "@/academy/lib/theme";
import {
  adminDeleteChapter,
  adminDeleteModule,
  adminDuplicateModule,
  adminGetTree,
  adminReorderChapter,
  adminReorderModule,
  adminSetAccess,
  adminSetStatus,
  adminUpdateChapter,
} from "@/services/academy/academyApi";
import type { LevelId } from "@/types/academy";
import { Chip, ConfirmDialog, PageTitle, Segmented, errMsg } from "./components/kit";
import { SubjectCard } from "./tree/SubjectCard";
import { ChapterForm, LEVELS, SubjectForm } from "./tree/forms";
import type { TreeChapter, TreeModule, TreeSubject } from "./tree/types";
import type { ChapterActions } from "./tree/ChapterBlock";
import type { ModuleRowActions } from "./tree/ModuleRow";

type StreamFilter = "all" | "natural-science" | "social-science";

function swap<T>(arr: T[], i: number, j: number): T[] {
  if (j < 0 || j >= arr.length) return arr;
  const a = [...arr];
  [a[i], a[j]] = [a[j], a[i]];
  return a;
}

export default function ContentTree() {
  const [level, setLevel] = useState<LevelId>("grade-12");
  const [stream, setStream] = useState<StreamFilter>("all");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { data, loading, error, reload, refresh, setData } = useAsync(() => adminGetTree({ level_id: level }), [level]);

  const [subjectForm, setSubjectForm] = useState(false);
  const [chapterForm, setChapterForm] = useState<{ subject: TreeSubject; chapter: TreeChapter | null } | null>(null);
  const [delModule, setDelModule] = useState<TreeModule | null>(null);
  const [delChapter, setDelChapter] = useState<TreeChapter | null>(null);

  const subjects = useMemo(() => (data?.tree ?? []).filter((s) => stream === "all" || s.stream_id === stream || s.stream_id === "common"), [data, stream]);

  /** Apply an optimistic change to the local tree. */
  const patch = (fn: (tree: TreeSubject[]) => TreeSubject[]) =>
    setData((d) => (d ? { ...d, tree: fn(d.tree) } : d));
  const mapChapter = (id: string, fn: (c: TreeChapter) => TreeChapter) =>
    patch((t) => t.map((s) => ({ ...s, chapters: s.chapters.map((c) => (c.id === id ? fn(c) : c)) })));
  const mapModule = (id: string, fn: (m: TreeModule) => TreeModule) =>
    patch((t) => t.map((s) => ({ ...s, chapters: s.chapters.map((c) => ({ ...c, modules: c.modules.map((m) => (m.id === id ? fn(m) : m)) })) })));
  const fail = (e: unknown) => {
    toast.error(errMsg(e));
    refresh();
  };

  const moduleActions: ModuleRowActions = {
    onToggleAccess: async (m) => {
      const next = m.access_status === "free" ? "premium" : "free";
      mapModule(m.id, (x) => ({ ...x, access_status: next }));
      try {
        await adminSetAccess(m.id, { access_status: next });
        toast.success(`"${m.title}" is now ${next === "free" ? "Free" : "Premium"}`);
      } catch (e) {
        fail(e);
      }
    },
    onTogglePublish: async (m) => {
      const next = m.publish_status === "published" ? "draft" : "published";
      mapModule(m.id, (x) => ({ ...x, publish_status: next }));
      try {
        await adminSetStatus(m.id, next);
        toast.success(next === "published" ? "Published" : "Moved to draft");
      } catch (e) {
        fail(e);
      }
    },
    onDuplicate: async (m) => {
      try {
        await adminDuplicateModule(m.id);
        toast.success("Module duplicated as draft");
        refresh();
      } catch (e) {
        fail(e);
      }
    },
    onDelete: (m) => setDelModule(m),
    onMove: async (m, dir) => {
      patch((t) =>
        t.map((s) => ({
          ...s,
          chapters: s.chapters.map((c) => {
            const i = c.modules.findIndex((x) => x.id === m.id);
            return i < 0 ? c : { ...c, modules: swap(c.modules, i, dir === "up" ? i - 1 : i + 1) };
          }),
        })),
      );
      try {
        await adminReorderModule(m.id, dir);
      } catch (e) {
        fail(e);
      }
    },
  };

  const chapterActions: ChapterActions = {
    onTogglePremium: async (c) => {
      const next = !c.is_premium;
      mapChapter(c.id, (x) => ({ ...x, is_premium: next }));
      try {
        await adminUpdateChapter(c.id, { is_premium: next });
        toast.success(next ? "Chapter is Premium" : "Chapter is Free");
      } catch (e) {
        fail(e);
      }
    },
    onMove: async (c, dir) => {
      patch((t) =>
        t.map((s) => {
          const i = s.chapters.findIndex((x) => x.id === c.id);
          return i < 0 ? s : { ...s, chapters: swap(s.chapters, i, dir === "up" ? i - 1 : i + 1) };
        }),
      );
      try {
        await adminReorderChapter(c.id, dir);
      } catch (e) {
        fail(e);
      }
    },
    onEdit: (c) => {
      const subject = data?.tree.find((s) => s.id === c.subject_id);
      if (subject) setChapterForm({ subject, chapter: c });
    },
    onDelete: (c) => setDelChapter(c),
  };

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div>
      <PageTitle
        title="Course builder"
        hint="Subjects, chapters and modules"
        action={
          <Button className="h-11" onClick={() => setSubjectForm(true)}>
            <Plus className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Add</span> subject
          </Button>
        }
      />

      <div className="sticky top-14 z-20 -mx-4 mb-4 space-y-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur lg:top-14 lg:-mx-6 lg:px-6">
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide" role="group" aria-label="Level">
          {LEVELS.map((l) => (
            <Chip key={l} active={level === l} onClick={() => setLevel(l)}>
              {LEVEL_SHORT[l]}
            </Chip>
          ))}
        </div>
        <Segmented<StreamFilter>
          label="Stream"
          value={stream}
          onChange={setStream}
          className="max-w-md"
          options={[
            { value: "natural-science", label: "Natural" },
            { value: "social-science", label: "Social" },
            { value: "all", label: "All" },
          ]}
        />
      </div>

      {loading && !data ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading subjects">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[72px] rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <InlineError message={error} onRetry={reload} />
      ) : subjects.length === 0 ? (
        <EmptyState icon={<Library className="h-6 w-6" />} title="No subjects here yet" hint="Add a subject for this level and stream." action={<Button className="mt-2 h-11" onClick={() => setSubjectForm(true)}>Add subject</Button>} />
      ) : (
        <div className="grid items-start gap-3 xl:grid-cols-2">
          {subjects.map((s) => (
            <SubjectCard
              key={s.id}
              subject={s}
              open={open.has(s.id)}
              onToggle={() => toggle(s.id)}
              onAddChapter={() => setChapterForm({ subject: s, chapter: null })}
              chapterActions={chapterActions}
              moduleActions={moduleActions}
            />
          ))}
        </div>
      )}

      <SubjectForm
        open={subjectForm}
        onOpenChange={setSubjectForm}
        defaultLevel={level}
        onCreated={(l) => {
          if (l !== level) setLevel(l);
          else refresh();
        }}
      />
      <ChapterForm
        open={chapterForm !== null}
        onOpenChange={(o) => !o && setChapterForm(null)}
        subjectId={chapterForm?.subject.id ?? ""}
        subjectName={chapterForm?.subject.name ?? ""}
        chapter={chapterForm?.chapter}
        onSaved={() => {
          if (chapterForm) setOpen((s) => new Set(s).add(chapterForm.subject.id));
          refresh();
        }}
      />
      <ConfirmDialog
        open={delModule !== null}
        onOpenChange={(o) => !o && setDelModule(null)}
        title="Delete this module?"
        description={delModule ? `"${delModule.title}" and its flashcards, quiz and drafts will be removed. This cannot be undone.` : undefined}
        onConfirm={async () => {
          if (!delModule) return;
          const id = delModule.id;
          patch((t) => t.map((s) => ({ ...s, chapters: s.chapters.map((c) => ({ ...c, modules: c.modules.filter((m) => m.id !== id) })) })));
          try {
            await adminDeleteModule(id);
            toast.success("Module deleted");
          } catch (e) {
            fail(e);
          }
        }}
      />
      <ConfirmDialog
        open={delChapter !== null}
        onOpenChange={(o) => !o && setDelChapter(null)}
        title="Delete this chapter?"
        description={delChapter ? `"${delChapter.title}" and its ${delChapter.modules.length} module(s) will be removed. This cannot be undone.` : undefined}
        onConfirm={async () => {
          if (!delChapter) return;
          const id = delChapter.id;
          patch((t) => t.map((s) => ({ ...s, chapters: s.chapters.filter((c) => c.id !== id) })));
          try {
            await adminDeleteChapter(id);
            toast.success("Chapter deleted");
          } catch (e) {
            fail(e);
          }
        }}
      />
    </div>
  );
}
