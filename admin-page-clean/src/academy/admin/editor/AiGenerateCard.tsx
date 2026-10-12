import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileText, HelpCircle, Layers, Lightbulb, Loader2, ScrollText, Sparkles, Subtitles, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAsync } from "@/academy/hooks/useAsync";
import { adminGenerateDrafts, adminGetDrafts } from "@/services/academy/academyApi";
import type { AiDraft, AiDraftKind, Difficulty } from "@/types/academy";
import { ADMIN_BASE, Chip, Field, Panel, PanelTitle, Segmented, Stepper, errMsg, notifyDraftsChanged } from "../components/kit";

const KINDS: Array<{ value: AiDraftKind; label: string; icon: LucideIcon }> = [
  { value: "flashcards", label: "Flashcards", icon: Layers },
  { value: "quiz", label: "Quiz", icon: HelpCircle },
  { value: "summary", label: "Summary", icon: ScrollText },
  { value: "key_concepts", label: "Key concepts", icon: Lightbulb },
];
export const KIND_LABEL: Record<AiDraftKind, string> = { flashcards: "Flashcards", quiz: "Quiz", summary: "Summary", key_concepts: "Key concepts" };
export const KIND_ICON: Record<AiDraftKind, LucideIcon> = { flashcards: Layers, quiz: HelpCircle, summary: ScrollText, key_concepts: Lightbulb };

type Diff = Difficulty | "Mixed";

export function AiGenerateCard({ moduleId, hasVideo, hasDocs }: { moduleId: string; hasVideo: boolean; hasDocs: boolean }) {
  const [kinds, setKinds] = useState<AiDraftKind[]>(["flashcards", "quiz"]);
  const [count, setCount] = useState(6);
  const [diff, setDiff] = useState<Diff>("Mixed");
  const [source, setSource] = useState<AiDraft["source"]>("markdown");
  const [busy, setBusy] = useState(false);
  const { data, reload } = useAsync(() => (moduleId ? adminGetDrafts(moduleId) : Promise.resolve([] as AiDraft[])), [moduleId]);
  const pending = (data ?? []).filter((d) => d.status === "pending");

  const generate = async () => {
    setBusy(true);
    try {
      const made = await adminGenerateDrafts({ module_id: moduleId, kinds, count, difficulty: diff, source });
      toast.success(`${made.length} draft${made.length === 1 ? "" : "s"} ready for review`);
      notifyDraftsChanged();
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="space-y-4">
      <PanelTitle icon={Sparkles}>AI generate</PanelTitle>
      <p className="text-xs text-muted-foreground">Drafts are never published automatically. Review, edit, approve, then publish.</p>
      {!moduleId ? (
        <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">Save the module first to generate drafts.</p>
      ) : (
        <>
          <Field label="What to make">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Draft kinds">
              {KINDS.map((k) => (
                <Chip key={k.value} icon={k.icon} active={kinds.includes(k.value)} onClick={() => setKinds((ks) => (ks.includes(k.value) ? ks.filter((x) => x !== k.value) : [...ks, k.value]))}>
                  {k.label}
                </Chip>
              ))}
            </div>
          </Field>
          <div className="flex flex-wrap gap-4">
            <Field label="How many">
              <Stepper label="count" value={count} min={1} max={15} onChange={setCount} />
            </Field>
          </div>
          <Field label="Difficulty">
            <Segmented<Diff> label="Difficulty" compact value={diff} onChange={setDiff} options={[{ value: "Mixed", label: "Mixed" }, { value: "Easy", label: "Easy" }, { value: "Medium", label: "Medium" }, { value: "Hard", label: "Hard" }]} />
          </Field>
          <Field label="Source" hint={!hasVideo && !hasDocs ? "Add a video or document to use other sources" : undefined}>
            <Segmented<AiDraft["source"]> label="Source" compact value={source} onChange={setSource} options={[{ value: "markdown", label: "Reading", icon: FileText }, { value: "transcript", label: "Transcript", icon: Subtitles }, { value: "document", label: "Document", icon: FileText }]} />
          </Field>
          <Button className="h-11 w-full" disabled={busy || kinds.length === 0} onClick={generate}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />} Generate drafts
          </Button>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Waiting for review · {pending.length}</p>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing pending.</p>
            ) : (
              <ul className="space-y-2">
                {pending.map((d) => {
                  const Icon = KIND_ICON[d.kind];
                  const n = d.flashcards?.length ?? d.questions?.length ?? d.items?.length ?? (d.text ? 1 : 0);
                  return (
                    <li key={d.id} className="flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-amber-800">
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="flex-1 text-sm font-semibold">
                        {KIND_LABEL[d.kind]} · {n}
                      </span>
                      <span className="text-[11px] font-bold uppercase">Pending</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {pending.length > 0 && (
              <Link to={`${ADMIN_BASE}/ai-review`} className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Review drafts <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
