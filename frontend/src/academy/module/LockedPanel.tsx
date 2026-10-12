import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

/** Shown in place of a locked resource. `preview` is the server-provided teaser (never the real content). */
export function LockedPanel({ title, onUnlock, preview, hasReferral }: { title: string; onUnlock: () => void; preview?: ReactNode; hasReferral?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card">
      {preview && (
        <div aria-hidden className="pointer-events-none max-h-40 select-none overflow-hidden p-4 opacity-60 blur-[3px]">{preview}</div>
      )}
      <div className={`flex flex-col items-center gap-3 p-6 text-center ${preview ? "-mt-12 bg-gradient-to-t from-card via-card to-transparent pt-16" : ""}`}>
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-100 text-yellow-700"><Lock className="h-7 w-7" /></span>
        <h3 className="font-nunito text-lg font-extrabold">{title} is Premium</h3>
        <Button onClick={onUnlock} className="h-12 rounded-xl bg-gradient-to-r from-yellow-fix-600 to-orange-fix-700 px-6 text-base font-bold text-white hover:opacity-90">
          <Sparkles className="h-5 w-5" /> {hasReferral ? "Unlock" : "Upgrade"}
        </Button>
      </div>
    </div>
  );
}
