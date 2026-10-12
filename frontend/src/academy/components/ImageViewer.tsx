import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize, Minus, Plus, RotateCcw, X } from "lucide-react";

interface Props {
  src: string;
  alt?: string;
  onClose: () => void;
}

/**
 * Full-screen viewer with pinch / wheel / double-tap zoom and drag-to-pan.
 * Pointer-events based, so it works with touch (Telegram) and mouse alike.
 */
export function ImageViewer({ src, alt, onClose }: Props) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastDist = useRef(0);
  const lastTap = useRef(0);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const clamp = (s: number) => Math.min(5, Math.max(1, s));
  const reset = useCallback(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      drag.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
      const now = Date.now();
      if (now - lastTap.current < 280) {
        if (scale > 1) reset();
        else setScale(2.5);
      }
      lastTap.current = now;
    }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      lastDist.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastDist.current) setScale((s) => clamp(s * (d / lastDist.current)));
      lastDist.current = d;
    } else if (drag.current && scale > 1) {
      setPos({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    lastDist.current = 0;
    drag.current = null;
    if (scale <= 1) setPos({ x: 0, y: 0 });
  };

  const fullscreen = () => {
    const el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().catch(() => undefined);
  };

  const btn = "inline-flex h-11 w-11 items-center justify-center rounded-full bg-gray-fix-900/70 text-white backdrop-blur active:scale-95 focus-visible:ring-2 focus-visible:ring-white";

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={alt ?? "Image viewer"} className="fixed inset-0 z-[100] flex flex-col bg-gray-fix-950/95">
      <div className="flex items-center justify-between p-3 pt-safe">
        <p className="line-clamp-1 flex-1 px-2 text-sm font-semibold text-white">{alt}</p>
        <button className={btn} onClick={fullscreen} aria-label="Toggle fullscreen">
          <Maximize className="h-5 w-5" />
        </button>
        <button className={`${btn} ml-2`} onClick={onClose} aria-label="Close viewer">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div
        className="relative flex-1 touch-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => setScale((s) => clamp(s - e.deltaY * 0.002))}
      >
        <img
          src={src}
          alt={alt ?? ""}
          draggable={false}
          className="absolute inset-0 m-auto max-h-full max-w-full select-none object-contain"
          style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, transition: pointers.current.size ? "none" : "transform .15s" }}
        />
      </div>
      <div className="flex items-center justify-center gap-3 p-3 pb-safe">
        <button className={btn} onClick={() => setScale((s) => clamp(s - 0.5))} aria-label="Zoom out">
          <Minus className="h-5 w-5" />
        </button>
        <span className="min-w-[3.5rem] text-center text-sm font-bold text-white">{Math.round(scale * 100)}%</span>
        <button className={btn} onClick={() => setScale((s) => clamp(s + 0.5))} aria-label="Zoom in">
          <Plus className="h-5 w-5" />
        </button>
        <button className={btn} onClick={reset} aria-label="Reset zoom">
          <RotateCcw className="h-5 w-5" />
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** Thumbnail that opens the viewer on tap. */
export function ZoomableImage({ src, alt }: { src?: string; alt?: string }) {
  const [open, setOpen] = useState(false);
  if (!src) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group relative my-3 block w-full overflow-hidden rounded-xl border border-border" aria-label={`Open image: ${alt ?? ""}`}>
        <img src={src} alt={alt ?? ""} loading="lazy" className="w-full object-contain" />
        <span className="absolute bottom-2 right-2 rounded-full bg-gray-fix-900/70 p-1.5 text-white">
          <Maximize className="h-4 w-4" />
        </span>
      </button>
      {open && <ImageViewer src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}
