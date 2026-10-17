import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { adminCreateChapter, adminCreateSubject, adminMoveSubject, adminUpdateChapter } from "@/services/academy/academyApi";
import { TONES, TONE_NAMES, iconFor, levelShort, streamShort } from "@/features/lectures/lib/theme";
import { cn } from "@/lib/utils";
import type { LevelId, Program, Stream, StreamId } from "@/types/academy";
import { Chip, Field, FormSheet, Segmented, errMsg, inputCls, areaCls } from "../components/kit";
import type { TreeChapter } from "./types";

/** Streams a program offers, always including "common" (plan §5.1). */
export const streamsOf = (programs: Program[], level: LevelId): StreamId[] => {
  const p = programs.find((x) => x.id === level);
  const list = (p?.available_streams ?? []).filter((x) => x !== "common");
  return [...list, "common"];
};
const ICON_NAMES = ["BookOpen", "Calculator", "Atom", "FlaskConical", "Dna", "Globe", "Landmark", "TrendingUp", "Cpu", "Compass", "GraduationCap", "Target"];

/* ------------------------------- subject ------------------------------- */

export function SubjectForm({ open, onOpenChange, defaultLevel, onCreated, programs, streams }: { open: boolean; onOpenChange: (o: boolean) => void; defaultLevel: LevelId; onCreated: (level: LevelId) => void; programs: Program[]; streams: Stream[] }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [level, setLevel] = useState<LevelId>(defaultLevel);
  const [stream, setStream] = useState<StreamId>("common");
  const [color, setColor] = useState("blue");
  const [icon, setIcon] = useState("BookOpen");
  const [desc, setDesc] = useState("");
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setCode("");
      setDesc("");
      setErr(undefined);
      setLevel(defaultLevel);
      setStream(streamsOf(programs, defaultLevel)[0] ?? "common");
    }
  }, [open, defaultLevel, programs]);
  const allowed = streamsOf(programs, level);
  useEffect(() => {
    if (!allowed.includes(stream)) setStream(allowed[0] ?? "common");
  }, [level, allowed, stream]);

  const submit = async () => {
    if (name.trim().length < 2) return setErr("Name must be at least 2 characters");
    if (code.length > 8) return setErr("Code is too long");
    setBusy(true);
    try {
      await adminCreateSubject({ name: name.trim(), code: code.trim().toUpperCase() || undefined, level_id: level, stream_id: stream, color_theme: color, icon_name: icon, description: desc.trim() });
      toast.success("Subject added");
      onOpenChange(false);
      onCreated(level);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add subject"
      footer={
        <>
          <Button variant="outline" className="h-11 flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11 flex-1" onClick={submit} disabled={busy}>
            {busy ? "Adding…" : "Add subject"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid grid-cols-[1fr_6.5rem] gap-3">
          <Field label="Name" htmlFor="sub-name" error={err}>
            <input id="sub-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Biology" aria-invalid={!!err} />
          </Field>
          <Field label="Code" htmlFor="sub-code">
            <input id="sub-code" className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} placeholder="BIO" maxLength={8} />
          </Field>
        </div>
        <Field label="Level">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide" role="group" aria-label="Level">
            {programs.filter((p) => p.is_active).map((p) => (
              <Chip key={p.id} active={level === p.id} onClick={() => setLevel(p.id)}>
                {levelShort(programs, p.id)}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Stream">
          <Segmented<StreamId>
            label="Stream"
            value={stream}
            onChange={setStream}
            options={allowed.map((id) => ({ value: id, label: streamShort(streams, id) }))}
          />
        </Field>
        <Field label="Colour">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
            {TONE_NAMES.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={color === t} aria-label={t} onClick={() => setColor(t)} className={cn("flex h-11 w-11 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", TONES[t].solid)}>
                {color === t && <Check className="h-5 w-5" aria-hidden />}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Icon">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Icon">
            {ICON_NAMES.map((n) => {
              const I = iconFor(n);
              return (
                <button key={n} type="button" role="radio" aria-checked={icon === n} aria-label={n} onClick={() => setIcon(n)} className={cn("flex h-11 w-11 items-center justify-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", icon === n ? "border-transparent bg-blue-fix-600 text-white" : "border-border bg-card text-foreground")}>
                  <I className="h-5 w-5" aria-hidden />
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Description" htmlFor="sub-desc">
          <textarea id="sub-desc" className={areaCls} rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional" />
        </Field>
      </form>
    </FormSheet>
  );
}

/* ------------------------------- chapter ------------------------------- */

export function ChapterForm({ open, onOpenChange, subjectId, subjectName, chapter, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; subjectId: string; subjectName: string; chapter?: TreeChapter | null; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [premium, setPremium] = useState(false);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(chapter?.title ?? "");
      setDesc(chapter?.description ?? "");
      setPremium(chapter?.is_premium ?? false);
      setErr(undefined);
    }
  }, [open, chapter]);

  const submit = async () => {
    if (title.trim().length < 2) return setErr("Title must be at least 2 characters");
    setBusy(true);
    try {
      if (chapter) await adminUpdateChapter(chapter.id, { title: title.trim(), description: desc.trim(), is_premium: premium });
      else await adminCreateChapter({ subject_id: subjectId, title: title.trim(), description: desc.trim(), is_premium: premium });
      toast.success(chapter ? "Chapter updated" : "Chapter added");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={chapter ? "Edit chapter" : "Add chapter"}
      description={subjectName}
      footer={
        <>
          <Button variant="outline" className="h-11 flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11 flex-1" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Title" htmlFor="ch-title" error={err}>
          <input id="ch-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sequences & series" aria-invalid={!!err} autoFocus />
        </Field>
        <Field label="Description" htmlFor="ch-desc">
          <textarea id="ch-desc" className={areaCls} rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional" />
        </Field>
        <div className="flex min-h-11 items-center justify-between rounded-xl bg-muted px-3">
          <label htmlFor="ch-prem" className="text-sm font-semibold text-foreground">
            Premium chapter
          </label>
          <Switch id="ch-prem" checked={premium} onCheckedChange={setPremium} />
        </div>
      </form>
    </FormSheet>
  );
}

/* ------------------------------ move subject ------------------------------ */

export function MoveSubjectSheet({ open, onOpenChange, subject, programs, streams, onMoved }: { open: boolean; onOpenChange: (o: boolean) => void; subject: { id: string; name: string; level_id: LevelId; stream_id: StreamId } | null; programs: Program[]; streams: Stream[]; onMoved: (level: LevelId) => void }) {
  const [level, setLevel] = useState<LevelId>("");
  const [stream, setStream] = useState<StreamId>("common");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && subject) {
      setLevel(subject.level_id);
      setStream(subject.stream_id);
    }
  }, [open, subject]);

  const allowed = streamsOf(programs, level);
  useEffect(() => {
    if (level && !allowed.includes(stream)) setStream(allowed[0] ?? "common");
  }, [level, allowed, stream]);

  const same = subject && subject.level_id === level && subject.stream_id === stream;
  const submit = async () => {
    if (!subject || same) return;
    setBusy(true);
    try {
      await adminMoveSubject(subject.id, level, stream);
      toast.success(`"${subject.name}" moved to ${levelShort(programs, level)} · ${streamShort(streams, stream)}`);
      onOpenChange(false);
      onMoved(level);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Move subject"
      description={subject ? `All modules under "${subject.name}" follow it to the new program and stream.` : undefined}
      footer={
        <>
          <Button variant="outline" className="h-11 flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="h-11 flex-1" onClick={submit} disabled={busy || !!same}>
            {busy ? "Moving…" : "Move"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Program">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide" role="group" aria-label="Program">
            {programs.filter((p) => p.is_active || p.id === subject?.level_id).map((p) => (
              <Chip key={p.id} active={level === p.id} onClick={() => setLevel(p.id)}>
                {levelShort(programs, p.id)}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Stream">
          <Segmented<StreamId> label="Stream" value={stream} onChange={setStream} options={allowed.map((id) => ({ value: id, label: streamShort(streams, id) }))} />
        </Field>
      </div>
    </FormSheet>
  );
}
