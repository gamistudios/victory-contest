import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useAcademy } from "../context/AcademyContext";

/**
 * Best-effort content protection (a browser/Telegram WebView cannot truly block
 * screenshots): student-specific dynamic watermark, no context menu / copy /
 * drag, and the content is hidden whenever the page loses focus. The real
 * backend enforces download restrictions and signed URLs.
 */
export function ProtectedContent({ children, className, watermark = true, hideOnBlur = true, allowSelect = false }: { children: ReactNode; className?: string; watermark?: boolean; hideOnBlur?: boolean; allowSelect?: boolean }) {
  const { student } = useAcademy();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!hideOnBlur) return;
    const on = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [hideOnBlur]);

  const stamp = student ? `${student.full_name} · ${student.id}` : "Victory Academy";
  return (
    <div
      className={cn("relative", !allowSelect && "no-select", className)}
      onContextMenu={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <div className={cn("transition-[filter] duration-150", hidden && "blur-xl")}>{children}</div>
      {watermark && <Watermark text={stamp} />}
    </div>
  );
}

export function Watermark({ text }: { text: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <div className="absolute -inset-1/2 flex -rotate-[24deg] flex-wrap content-around justify-around gap-x-10 gap-y-14 opacity-[0.07] dark:opacity-[0.1]">
        {Array.from({ length: 36 }).map((_, i) => (
          <span key={i} className="whitespace-nowrap text-sm font-bold text-foreground">
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
