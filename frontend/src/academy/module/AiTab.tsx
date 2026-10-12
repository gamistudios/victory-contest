import { Bot, Lightbulb, ListChecks, Puzzle, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TutorMessage, TutorMode } from "@/types/academy";
import { aiTutor } from "@/services/academy/academyApi";
import { Markdown } from "../components/Markdown";
import { cn } from "@/lib/utils";

const QUICK: Array<{ mode: TutorMode; label: string; icon: typeof Bot; text: string }> = [
  { mode: "explain", label: "Explain simply", icon: Sparkles, text: "Explain this simply" },
  { mode: "analogy", label: "Analogy", icon: Puzzle, text: "Give me an analogy" },
  { mode: "example", label: "Example", icon: Lightbulb, text: "Show me an example" },
  { mode: "summary", label: "Summarize", icon: ListChecks, text: "Summarize this lesson" },
];

export function AiTab({ moduleId, moduleTitle, selection, onClearSelection }: { moduleId: string; moduleTitle: string; selection: string; onClearSelection: () => void }) {
  const [msgs, setMsgs] = useState<TutorMessage[]>([{ role: "assistant", content: `Hi! I'm your Victory Academy tutor. Ask me anything about **${moduleTitle}** — or tap a shortcut below.` }]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // block body on purpose: an effect must not return anything but a cleanup function
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  const send = async (message: string, mode: TutorMode = "chat") => {
    if (!message.trim() || busy) return;
    const sel = selection || undefined;
    setMsgs((m) => [...m, { role: "user", content: sel ? `“${sel.slice(0, 120)}${sel.length > 120 ? "…" : ""}”\n\n${message}` : message }]);
    setText("");
    setBusy(true);
    onClearSelection();
    try {
      const reply = await aiTutor({ module_id: moduleId, message, mode, selection: sel });
      setMsgs((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: `Sorry — ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[55dvh] flex-col">
      <div className="flex-1 space-y-3 pb-2" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex gap-2", m.role === "user" && "justify-end")}>
            {m.role === "assistant" && <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Bot className="h-4 w-4" /></span>}
            <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm", m.role === "user" ? "rounded-br-md bg-blue-fix-600 text-white" : "rounded-bl-md border border-border bg-card")}>
              {m.role === "assistant" ? <Markdown source={m.content} className="!text-sm [&_p]:my-1" /> : <p className="whitespace-pre-wrap">{m.content}</p>}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Bot className="h-4 w-4" /></span>
            <div className="flex items-center gap-1 rounded-2xl border border-border bg-card px-4 py-3" aria-label="Tutor is typing">{[0, 1, 2].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${d * 120}ms` }} />)}</div></div>
        )}
        <div ref={end} />
      </div>

      <div className="sticky bottom-[4.75rem] space-y-2 bg-gradient-to-t from-background via-background to-transparent pt-3">
        {selection && (
          <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-950">
            <span className="line-clamp-2 flex-1 font-semibold">“{selection}”</span>
            <button onClick={onClearSelection} aria-label="Remove selected text" className="tight shrink-0 p-1"><X className="h-4 w-4" /></button>
          </div>
        )}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-hide">
          {QUICK.map(({ mode, label, icon: Icon, text: t }) => (
            <button key={mode} disabled={busy} onClick={() => send(t, mode)} className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-bold active:scale-95 disabled:opacity-50"><Icon className="h-4 w-4 text-emerald-700" />{label}</button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex items-center gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about this lesson…" aria-label="Message the tutor" className="h-12 flex-1 rounded-full border border-input bg-card px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <button type="submit" disabled={!text.trim() || busy} aria-label="Send" className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-fix-600 text-white disabled:opacity-40"><Send className="h-5 w-5" /></button>
        </form>
      </div>
    </div>
  );
}
