import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, FileText, Presentation, X, ZoomIn, ZoomOut, Maximize, Lightbulb, CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DocumentAttachment, LearningModule } from "@/types/academy";
import { Watermark } from "../components/ProtectedContent";
import { useAcademy } from "../context/AcademyContext";
import { fmtBytes, fmtMinutes } from "../lib/theme";
import { postModuleProgress } from "@/services/academy/academyApi";
import { cn } from "@/lib/utils";

export function DocsTab({ module: m, initialPage }: { module: LearningModule; initialPage: number }) {
  const [open, setOpen] = useState<DocumentAttachment | null>(null);
  return (
    <div className="space-y-3">
      {m.document_attachments.map((d) => {
        const Icon = d.type === "pdf" ? FileText : Presentation;
        return (
          <button key={d.id} onClick={() => setOpen(d)} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left active:scale-[0.99]">
            <span className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-xl", d.type === "pdf" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700")}><Icon className="h-7 w-7" /></span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-bold leading-tight">{d.title}</p>
              <p className="mt-1 text-xs text-muted-foreground"><span className="font-bold uppercase">{d.type}</span> · {d.page_or_slide_count} {d.type === "pdf" ? "pages" : "slides"} · {fmtBytes(d.file_size_bytes)} · {fmtMinutes(d.estimated_minutes)}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        );
      })}
      {open && <DocumentViewer doc={open} moduleId={m.id} initialPage={initialPage} onClose={() => setOpen(null)} />}
    </div>
  );
}

function DocumentViewer({ doc, moduleId, initialPage, onClose }: { doc: DocumentAttachment; moduleId: string; initialPage: number; onClose: () => void }) {
  const { student } = useAcademy();
  const total = Math.max(doc.slides.length, 1);
  const [page, setPage] = useState(Math.min(Math.max(initialPage, 1), total));
  const [dir, setDir] = useState(1);
  const [zoom, setZoom] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  const slide = doc.slides[page - 1];

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const go = (d: number) => {
    const n = Math.min(total, Math.max(1, page + d));
    if (n === page) return;
    setDir(d);
    setPage(n);
    postModuleProgress(moduleId, { document_current_page: n, document_completed: n === total }).catch(() => undefined);
  };

  const fs = () => (document.fullscreenElement ? document.exitFullscreen?.() : box.current?.requestFullscreen?.().catch(() => undefined));
  const btn = "inline-flex h-11 w-11 items-center justify-center rounded-full bg-muted text-foreground active:scale-95 disabled:opacity-40";

  return createPortal(
    <div ref={box} role="dialog" aria-modal="true" aria-label={doc.title} className="fixed inset-0 z-[90] flex flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border p-2 pt-safe">
        <button className={btn} onClick={onClose} aria-label="Close document"><X className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{doc.title}</p><p className="text-xs text-muted-foreground">{page} / {total}</p></div>
        <button className={btn} onClick={() => setZoom((z) => Math.max(1, z - 0.25))} disabled={zoom <= 1} aria-label="Zoom out"><ZoomOut className="h-5 w-5" /></button>
        <button className={btn} onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))} disabled={zoom >= 2.5} aria-label="Zoom in"><ZoomIn className="h-5 w-5" /></button>
        <button className={btn} onClick={fs} aria-label="Fullscreen"><Maximize className="h-5 w-5" /></button>
      </div>
      <div className="relative flex-1 overflow-auto bg-muted/50 p-3" onContextMenu={(e) => e.preventDefault()}>
        <div style={{ width: `${zoom * 100}%`, minWidth: "100%" }} className="mx-auto">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.article
              key={page}
              custom={dir}
              initial={{ opacity: 0, x: dir * 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -60 }}
              transition={{ duration: 0.18 }}
              drag={zoom === 1 ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.4}
              onDragEnd={(_, i) => { if (i.offset.x < -70) go(1); else if (i.offset.x > 70) go(-1); }}
              className="relative flex min-h-[60dvh] flex-col rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              {slide ? (
                <>
                  <span className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Slide {slide.slide_number}</span>
                  <h2 className="font-nunito text-2xl font-extrabold leading-tight">{slide.title}</h2>
                  <ul className="mt-4 space-y-3">
                    {slide.key_points.map((k, i) => (
                      <li key={i} className="flex gap-2 text-base"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />{k}</li>
                    ))}
                  </ul>
                  {slide.diagram_title && (
                    <div className="mt-5 flex h-36 items-center justify-center rounded-xl border border-dashed border-border bg-muted text-center text-xs font-bold text-muted-foreground">{slide.diagram_title}</div>
                  )}
                  {slide.notes && (
                    <div className="mt-auto flex gap-2 rounded-xl bg-amber-50 p-3 pt-3 text-sm text-amber-950"><Lightbulb className="h-4 w-4 shrink-0" />{slide.notes}</div>
                  )}
                </>
              ) : (
                <p className="m-auto text-sm text-muted-foreground">Preview unavailable.</p>
              )}
              <Watermark text={student ? `${student.full_name} · ${student.id}` : "Victory Academy"} />
            </motion.article>
          </AnimatePresence>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border p-3 pb-safe">
        <button className={btn} onClick={() => go(-1)} disabled={page === 1} aria-label="Previous page"><ChevronLeft className="h-5 w-5" /></button>
        <div className="flex flex-1 justify-center gap-1.5" aria-hidden>
          {Array.from({ length: total }).map((_, i) => <span key={i} className={cn("h-2 rounded-full transition-all", i + 1 === page ? "w-6 bg-brand" : "w-2 bg-border")} />)}
        </div>
        <button className={btn} onClick={() => go(1)} disabled={page === total} aria-label="Next page"><ChevronRight className="h-5 w-5" /></button>
      </div>
    </div>,
    document.body,
  );
}
