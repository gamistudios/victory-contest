import { useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, Lock, Sparkles, Target } from "lucide-react";
import type { LearningModule } from "@/types/academy";
import { Markdown } from "../components/Markdown";
import { ProtectedContent } from "../components/ProtectedContent";
import type { ReferralState } from "../components/UpgradeSheet";
import { cn } from "@/lib/utils";
import { postModuleProgress } from "@/services/academy/academyApi";

interface Props {
  module: LearningModule;
  locked: boolean;
  /** Every resource of this lesson is premium, not just the reading. */
  fullyLocked: boolean;
  referral: ReferralState | null;
  onUpgrade: () => void;
  onAskSelection: (text: string) => void;
  onProgress: (pct: number) => void;
  initialPct: number;
}

export function ReadTab({ module: m, locked, fullyLocked, referral, onUpgrade, onAskSelection, onProgress, initialPct }: Props) {
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

  // A locked lesson arrives with reading_markdown already cut down to a one-line
  // teaser by the server. That teaser is the honest preview; showing it inside a
  // plain body under a "Mark complete" button just looks like broken content.
  if (locked) return <LockedRead teaser={m.reading_markdown} fullyLocked={fullyLocked} referral={referral} onUpgrade={onUpgrade} />;

  return (
    <div className="space-y-4">
      {m.learning_objectives.length > 0 && (
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

/**
 * Premium gate for the Read tab. The card says what is locked and how to get it;
 * the server-cut teaser is shown as the preview, never as an apparent full body.
 */
function LockedRead({ teaser, fullyLocked, referral, onUpgrade }: { teaser: string; fullyLocked: boolean; referral: ReferralState | null; onUpgrade: () => void }) {
  const canShare = !!referral?.enabled && !referral.unlocked;
  return (
    <div className="overflow-hidden rounded-3xl border border-yellow-200 bg-yellow-50">
      <div className="flex items-center gap-3 p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-yellow-100 text-yellow-700"><Lock className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-yellow-950">{fullyLocked ? "Premium lesson" : "Premium content"}</p>
          <p className="mt-0.5 text-xs leading-snug text-yellow-900/80">{fullyLocked ? "This lesson is for Premium members only." : "The rest of this lesson is for Premium members only."}</p>
        </div>
        <button onClick={onUpgrade} className="shrink-0 rounded-full bg-gradient-to-r from-yellow-fix-600 to-orange-fix-700 px-3.5 py-2 text-xs font-extrabold text-white active:scale-95">
          <Sparkles className="mr-1 inline h-3.5 w-3.5" />Unlock
        </button>
      </div>
      {teaser.trim() && (
        <div className="border-t border-yellow-200/70 px-4 py-3">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-yellow-800">What you unlock</p>
          <Markdown source={teaser} className="mt-1 !text-sm text-yellow-950 [&_p]:my-1" />
        </div>
      )}
      {canShare && (
        <button onClick={onUpgrade} className="w-full border-t border-yellow-200/70 px-4 py-2.5 text-left text-xs font-bold text-yellow-900 underline underline-offset-2">
          or invite {referral?.required} friends to unlock this lesson free
        </button>
      )}
    </div>
  );
}
