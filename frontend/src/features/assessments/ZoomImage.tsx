import { useState } from "react";
import { X } from "lucide-react";

/** Tap-to-zoom image (plan §7.2). Renders nothing when the asset is missing or fails to load. */
export default function ZoomImage({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  if (!src || broken) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-3 block w-full text-left" aria-label={`Enlarge: ${alt}`}>
        <img src={src} alt={alt} onError={() => setBroken(true)} className={className ?? "max-h-64 w-full rounded-lg border border-border object-contain"} />
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={alt} onClick={() => setOpen(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-scrim/90 p-4 backdrop-blur-sm">
          <div className="relative max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <img src={src} alt="" className="max-h-[85vh] w-auto rounded-xl object-contain" />
            <button type="button" onClick={() => setOpen(false)} aria-label="Close image view"
              className="absolute -right-3 -top-3 rounded-full bg-card p-1.5 shadow-lg">
              <X className="h-5 w-5 text-foreground" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
