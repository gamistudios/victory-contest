import { useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, Target } from "lucide-react";
import type { LearningModule } from "@/types/academy";
import { Markdown } from "../components/Markdown";
import { ProtectedContent } from "../components/ProtectedContent";
import { cn } from "@/lib/utils";
import { postModuleProgress } from "@/services/academy/academyApi";

interface Props {
  module: LearningModule;
  locked: boolean;
  onAskSelection: (text: string) => void;
  onProgress: (pct: number) => void;
  initialPct: number;
}

export function ReadTab({ module: m, locked, onAskSelection, onProgress, initialPct }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState("");
  const [objOpen, setObjOpen] = useState(false);
  const last = useRef(initialPct);

  // Reading progress from window scroll, reported in 10 % steps.
  useEffect(() => {
    if (locked) return;
    const on = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight * 0.6;
      const pct = total <= 0 ? 100 : Math.min(100, Math.max(0, Math.round((-r.top / total) * 100)));
      const step = Math.floor(pct / 10) * 10;
      if (step > last.current) {
        last.current = step;
        onProgress(step);
        postModuleProgress(m.id, { read_percentage: step }).catch(() => undefined);
      }
    };
    window.addEventListener("scroll", on, { passive: true });
    on();
    return () => window.removeEventListener("scroll", on);
  }, [m.id, locked, onProgress]);

  // Selected text → "Ask AI" button.
  useEffect(() => {
    const on = () => {
      const s = window.getSelection();
      const t = s?.toString().trim() ?? "";
      const inside = !!s?.anchorNode && !!ref.current?.contains(s.anchorNode);
      setSel(inside && t.length > 3 ? t : "");
    };
    document.addEventListener("selectionchange", on);
    return () => document.removeEventListener("selectionchange", on);
  }, []);

  return (
    <div className="space-y-4">
      {!locked && m.learning_objectives.length > 0 && (
        <div className="rounded-2xl border border-border bg-card">
          <button onClick={() => setObjOpen((o) => !o)} aria-expanded={objOpen} className="flex w-full items-center gap-2 p-3 text-left">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 text-green-700"><Target className="h-4 w-4" /></span>
            <span className="flex-1 text-sm font-bold">You will learn</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold">{m.learning_objectives.length}</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", objOpen && "rotate-180")} />
          </button>
          {objOpen && (
            <ul className="space-y-2 border-t border-border p-3 pt-2">
              {m.learning_objectives.map((o, i) => (
                <li key={i} className="flex gap-2 text-sm"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{o}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div ref={ref}>
        <ProtectedContent allowSelect hideOnBlur={!locked}>
          <Markdown source={m.reading_markdown} />
        </ProtectedContent>
      </div>
      {sel && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { onAskSelection(sel); setSel(""); window.getSelection()?.removeAllRanges(); }}
          className="fixed bottom-24 left-1/2 z-40 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-gray-fix-900 px-5 text-sm font-bold text-white shadow-xl active:scale-95"
        >
          <Bot className="h-5 w-5" /> Ask AI about this
        </button>
      )}
    </div>
  );
}
