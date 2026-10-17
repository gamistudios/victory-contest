import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminTreeSubject, LearningModule } from "@/types/academy";
import { inputCls } from "../components/kit";
import { clock, parseClock, type Errors } from "./helpers";

export interface TabProps {
  m: LearningModule;
  set: (patch: Partial<LearningModule>) => void;
  errors: Errors;
  tree: AdminTreeSubject[];
  isNew: boolean;
}

/** mm:ss text field that only commits valid values. */
export function ClockInput({ seconds, onCommit, label, id }: { seconds: number; onCommit: (n: number) => void; label: string; id?: string }) {
  const [text, setText] = useState(clock(seconds));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(clock(seconds));
    setBad(false);
  }, [seconds]);
  return (
    <input
      id={id}
      aria-label={label}
      aria-invalid={bad}
      inputMode="numeric"
      className={cn(inputCls, bad && "border-destructive")}
      value={text}
      placeholder="mm:ss"
      onChange={(e) => {
        setText(e.target.value);
        setBad(false);
      }}
      onBlur={() => {
        const n = parseClock(text);
        if (n === null) setBad(true);
        else {
          setBad(false);
          onCommit(n);
          setText(clock(n));
        }
      }}
    />
  );
}

/** Collapsible editor row: summary header (always visible) + body. */
export function Expandable({ summary, open, onToggle, children, invalid }: { summary: ReactNode; open: boolean; onToggle: () => void; children: ReactNode; invalid?: boolean }) {
  const id = useId();
  return (
    <div className={cn("rounded-xl border bg-background", invalid ? "border-destructive" : "border-border")}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle} className="flex min-h-[52px] w-full items-center gap-2 rounded-xl px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="min-w-0 flex-1">{summary}</div>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id={id} className="space-y-3 border-t border-border p-3">
          {children}
        </div>
      )}
    </div>
  );
}
