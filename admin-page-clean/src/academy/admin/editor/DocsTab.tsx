import { useRef, useState } from "react";
import { FileText, Plus, Presentation, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/academy/components/States";
import { fmtBytes } from "@/academy/lib/theme";
import type { DocumentAttachment, DocumentSlide } from "@/types/academy";
import { Field, IconBtn, Panel, Segmented, Stepper, areaCls, inputCls, uid } from "../components/kit";
import { Expandable, type TabProps } from "./parts";

const blank = (): DocumentAttachment => ({ id: uid("doc"), title: "", type: "pdf", url: "", file_size_bytes: 0, page_or_slide_count: 1, estimated_minutes: 10, description: "", slides: [] });

function DocCard({ d, error, onChange, onRemove }: { d: DocumentAttachment; error?: string; onChange: (d: DocumentAttachment) => void; onRemove: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(!d.title);
  const [slidesOpen, setSlidesOpen] = useState(false);
  const patch = (p: Partial<DocumentAttachment>) => onChange({ ...d, ...p });
  const Icon = d.type === "pptx" ? Presentation : FileText;
  const setSlide = (i: number, p: Partial<DocumentSlide>) => patch({ slides: d.slides.map((s, j) => (j === i ? { ...s, ...p } : s)) });

  const onFile = (f?: File) => {
    if (!f) return;
    const isPpt = /\.pptx?$/i.test(f.name);
    const isPdf = /\.pdf$/i.test(f.name);
    if (!isPpt && !isPdf) return toast.error("Choose a PDF or PPTX file");
    patch({ url: URL.createObjectURL(f), file_size_bytes: f.size, type: isPpt ? "pptx" : "pdf", title: d.title || f.name.replace(/\.[^.]+$/, "") });
    toast.success("File attached (demo upload, this session only)");
  };

  return (
    <Expandable
      open={open}
      onToggle={() => setOpen((o) => !o)}
      invalid={!!error}
      summary={
        <div className="flex items-center gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${d.type === "pptx" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`}>
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">{d.title || "Untitled document"}</p>
            <p className="truncate text-xs text-muted-foreground">
              {d.type.toUpperCase()} · {d.page_or_slide_count} {d.type === "pptx" ? "slides" : "pages"}
              {d.file_size_bytes > 0 && ` · ${fmtBytes(d.file_size_bytes)}`}
              {error && <span className="font-semibold text-destructive"> · {error}</span>}
            </p>
          </div>
        </div>
      }
    >
      <Segmented<"pdf" | "pptx"> label="Document type" value={d.type} onChange={(t) => patch({ type: t })} options={[{ value: "pdf", label: "PDF", icon: FileText }, { value: "pptx", label: "PPTX", icon: Presentation }]} />
      <Field label="Title" htmlFor={`${d.id}-t`} error={error}>
        <input id={`${d.id}-t`} className={inputCls} value={d.title} onChange={(e) => patch({ title: e.target.value })} aria-invalid={!!error} />
      </Field>
      <Field label="File link" htmlFor={`${d.id}-u`}>
        <input id={`${d.id}-u`} type="url" inputMode="url" className={inputCls} value={d.url.startsWith("blob:") ? "" : d.url} placeholder={d.url.startsWith("blob:") ? "Uploaded file (this session)" : "https://…"} onChange={(e) => patch({ url: e.target.value })} />
        <input ref={file} type="file" accept=".pdf,.ppt,.pptx" className="sr-only" tabIndex={-1} aria-label="Upload file" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        <Button type="button" variant="outline" className="mt-1 h-11" onClick={() => file.current?.click()}>
          <Upload className="h-4 w-4" aria-hidden /> Upload file
        </Button>
        {d.url.startsWith("blob:") && <p className="text-xs text-muted-foreground">Demo upload: the link works until you reload.</p>}
      </Field>
      <div className="flex flex-wrap gap-4">
        <Field label={d.type === "pptx" ? "Slides" : "Pages"}>
          <Stepper label={d.type === "pptx" ? "slides" : "pages"} value={d.page_or_slide_count} min={1} max={500} onChange={(n) => patch({ page_or_slide_count: n })} />
        </Field>
        <Field label="Study time">
          <Stepper label="minutes" suffix="min" value={d.estimated_minutes} min={1} max={240} step={5} onChange={(n) => patch({ estimated_minutes: n })} />
        </Field>
      </div>
      <Field label="Description" htmlFor={`${d.id}-d`}>
        <textarea id={`${d.id}-d`} rows={2} className={areaCls} value={d.description} onChange={(e) => patch({ description: e.target.value })} />
      </Field>

      <Expandable open={slidesOpen} onToggle={() => setSlidesOpen((o) => !o)} summary={<p className="text-sm font-bold">Slide outline · {d.slides.length}</p>}>
        <ol className="space-y-3">
          {d.slides.map((s, i) => (
            <li key={i} className="space-y-2 rounded-lg bg-muted/50 p-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{i + 1}</span>
                <input aria-label={`Slide ${i + 1} title`} className={inputCls} value={s.title} placeholder="Slide title" onChange={(e) => setSlide(i, { title: e.target.value })} />
                <IconBtn label={`Remove slide ${i + 1}`} icon={X} tone="danger" onClick={() => patch({ slides: d.slides.filter((_, j) => j !== i) })} />
              </div>
              <textarea aria-label={`Slide ${i + 1} bullets, one per line`} rows={3} className={areaCls} value={s.key_points.join("\n")} placeholder="One bullet per line" onChange={(e) => setSlide(i, { key_points: e.target.value.split("\n") })} />
            </li>
          ))}
        </ol>
        <Button type="button" variant="outline" className="h-11" onClick={() => patch({ slides: [...d.slides, { slide_number: d.slides.length + 1, title: "", key_points: [] }] })}>
          <Plus className="h-4 w-4" aria-hidden /> Add slide
        </Button>
      </Expandable>

      <Button type="button" variant="ghost" className="h-11 text-destructive hover:text-destructive" onClick={onRemove}>
        <Trash2 className="h-4 w-4" aria-hidden /> Remove document
      </Button>
    </Expandable>
  );
}

export function DocsTab({ m, set, errors }: TabProps) {
  const docs = m.document_attachments;
  return (
    <div className="space-y-3">
      {docs.length === 0 ? (
        <EmptyState icon={<FileText className="h-6 w-6" />} title="No documents yet" hint="Attach PDFs or slide decks." />
      ) : (
        <Panel className="space-y-3">
          {docs.map((d) => (
            <DocCard key={d.id} d={d} error={errors.docs[d.id]} onChange={(nd) => set({ document_attachments: docs.map((x) => (x.id === d.id ? nd : x)) })} onRemove={() => set({ document_attachments: docs.filter((x) => x.id !== d.id) })} />
          ))}
        </Panel>
      )}
      <Button type="button" className="h-11" onClick={() => set({ document_attachments: [...docs, blank()] })}>
        <Plus className="h-4 w-4" aria-hidden /> Add document
      </Button>
    </div>
  );
}
