import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BookOpen, ChevronLeft, FileText, Info, Layers, Loader2, Lock, Save, Video, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineError } from "@/features/lectures/components/States";
import { useAsync } from "@/features/lectures/hooks/useAsync";
import { adminCreateModule, adminGetModule, adminGetTree, adminUpdateModule } from "@/services/academy/academyApi";
import type { LearningModule, ModuleInput, PublishStatus } from "@/types/academy";
import { cn } from "@/lib/utils";
import { ADMIN_BASE, STATUS_OPTIONS, StatusPill, errMsg } from "./components/kit";
import { useNavGuard } from "./components/guard";
import { ActivitiesTab } from "./editor/ActivitiesTab";
import { AccessTab } from "./editor/AccessTab";
import { BasicsTab } from "./editor/BasicsTab";
import { DocsTab } from "./editor/DocsTab";
import { ReadTab } from "./editor/ReadTab";
import { VideoTab } from "./editor/VideoTab";
import { blankModule, errorTabs, hasErrors, toPayload, validate, type Errors, type TabId } from "./editor/helpers";
import type { TabProps } from "./editor/parts";

const TABS: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: "basics", label: "Basics", icon: Info },
  { id: "read", label: "Read", icon: BookOpen },
  { id: "video", label: "Video", icon: Video },
  { id: "docs", label: "Docs", icon: FileText },
  { id: "activities", label: "Activities", icon: Layers },
  { id: "access", label: "Access", icon: Lock },
];
const NO_ERRORS: Errors = { docs: {}, quiz: {} };

export default function ModuleEditor() {
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const chapterParam = search.get("chapter");
  const navigate = useNavigate();
  const guard = useNavGuard();
  const isNew = !id;

  const { data, loading, error, reload } = useAsync(async () => {
    const tree = (await adminGetTree()).tree;
    if (id) return { tree, module: (await adminGetModule(id)).module };
    const blank = blankModule(tree, chapterParam);
    if (!blank) throw new Error("Create a chapter first, then add modules to it.");
    return { tree, module: blank };
  }, [id, chapterParam]);

  const [draft, setDraft] = useState<LearningModule | null>(null);
  const [base, setBase] = useState("");
  const [tab, setTab] = useState<TabId>("basics");
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setDraft(data.module);
      setBase(JSON.stringify(data.module));
      setShowErrors(false);
    }
  }, [data]);

  const dirty = !!draft && JSON.stringify(draft) !== base;
  const { setDirty } = guard;
  useEffect(() => {
    setDirty(dirty);
  }, [dirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const set = useCallback((p: Partial<LearningModule>) => setDraft((d) => (d ? { ...d, ...p } : d)), []);
  const live = useMemo(() => (draft ? validate(draft) : NO_ERRORS), [draft]);
  const errors = showErrors ? live : NO_ERRORS;
  const errTabs = showErrors ? errorTabs(live) : [];

  const save = async () => {
    if (!draft) return;
    const e = validate(draft);
    if (hasErrors(e)) {
      setShowErrors(true);
      const first = errorTabs(e)[0];
      setTab(first);
      toast.error("Fix the highlighted fields first");
      return;
    }
    setSaving(true);
    try {
      const payload = toPayload(draft);
      if (isNew) {
        const created = await adminCreateModule({ ...payload, chapter_id: draft.chapter_id, title: draft.title.trim() } as ModuleInput);
        toast.success("Module created");
        setBase(JSON.stringify(draft));
        setDirty(false);
        navigate(`${ADMIN_BASE}/module/${created.id}`, { replace: true });
      } else {
        const saved = await adminUpdateModule(draft.id, payload);
        setDraft(saved);
        setBase(JSON.stringify(saved));
        toast.success("Saved");
      }
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !draft) {
    return (
      <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading module">
        <Skeleton className="h-14 rounded-2xl" />
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }
  if (error || !draft || !data) {
    return (
      <div className="p-4">
        <InlineError message={error ?? "Module not found"} onRetry={reload} />
      </div>
    );
  }

  const props: TabProps = { m: draft, set, errors, tree: data.tree, isNew };

  return (
    <div>
      <div className="sticky top-0 z-20 border-b border-border bg-card/95 pt-safe backdrop-blur-lg lg:top-14">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 lg:px-6">
          <button type="button" aria-label="Back to course builder" onClick={() => guard.go(`${ADMIN_BASE}/content`)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-nunito-sans text-base font-extrabold text-foreground">{draft.title || (isNew ? "New module" : "Untitled")}</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {dirty ? (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-800" role="status">
                  <span className="h-2 w-2 rounded-full bg-amber-fix-600" aria-hidden /> Unsaved changes
                </span>
              ) : (
                <span>{isNew ? "Not saved yet" : "All saved"}</span>
              )}
              <StatusPill status={draft.publish_status} className="sm:hidden" />
            </div>
          </div>
          <div className="hidden sm:block">
            <Select value={draft.publish_status} onValueChange={(v) => set({ publish_status: v as PublishStatus })}>
              <SelectTrigger aria-label="Publish status" className="h-11 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="min-h-11">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="h-11 shrink-0 px-4" onClick={save} disabled={saving || (!dirty && !isNew)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Save
          </Button>
        </div>
        <div className="mx-auto max-w-6xl px-2 lg:px-4">
          <div role="tablist" aria-label="Module sections" className="flex gap-1 overflow-x-auto scrollbar-hide">
            {TABS.map((t) => {
              const active = t.id === tab;
              return (
                <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={active} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)} className={cn("relative flex min-h-11 shrink-0 items-center gap-1.5 px-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "font-bold text-foreground" : "font-medium text-muted-foreground hover:text-foreground")}>
                  <t.icon className="h-4 w-4" aria-hidden />
                  {t.label}
                  {errTabs.includes(t.id) && (
                    <>
                      <span className="h-2 w-2 rounded-full bg-destructive" aria-hidden />
                      <span className="sr-only">has errors</span>
                    </>
                  )}
                  {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand" aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mx-auto max-w-6xl px-4 pt-4 lg:px-6">
        {tab === "basics" && <BasicsTab {...props} />}
        {tab === "read" && <ReadTab {...props} />}
        {tab === "video" && <VideoTab {...props} />}
        {tab === "docs" && <DocsTab {...props} />}
        {tab === "activities" && <ActivitiesTab {...props} />}
        {tab === "access" && <AccessTab {...props} />}
      </div>
    </div>
  );
}
