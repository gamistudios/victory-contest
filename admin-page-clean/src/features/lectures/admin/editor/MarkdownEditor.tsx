import { useRef, useState } from "react";
import { AlertTriangle, BookMarked, Bold, Eye, Heading2, Image as ImageIcon, Italic, Lightbulb, List, Pencil, PenLine, Sigma, Sparkles, type LucideIcon } from "lucide-react";
import { Markdown } from "@/features/lectures/components/Markdown";
import { cn } from "@/lib/utils";
import { Segmented, areaCls, useIsDesktop } from "../components/kit";

interface Tool {
  label: string;
  icon: LucideIcon;
  run: (sel: string) => { text: string; selectInner?: [number, number] };
}

const callout = (kind: string, placeholder: string) => (sel: string) => {
  const body = sel || placeholder;
  const head = `\n:::${kind}\n`;
  return { text: `${head}${body}\n:::\n`, selectInner: [head.length, head.length + body.length] as [number, number] };
};
const wrap = (a: string, b: string, ph: string) => (sel: string) => {
  const body = sel || ph;
  return { text: `${a}${body}${b}`, selectInner: [a.length, a.length + body.length] as [number, number] };
};

const FORMAT: Tool[] = [
  { label: "Bold", icon: Bold, run: wrap("**", "**", "bold") },
  { label: "Italic", icon: Italic, run: wrap("*", "*", "italic") },
  { label: "Heading", icon: Heading2, run: wrap("\n## ", "\n", "Heading") },
  { label: "List", icon: List, run: (s) => ({ text: `\n${(s || "Item one\nItem two").split("\n").map((l) => `- ${l}`).join("\n")}\n` }) },
  { label: "Math", icon: Sigma, run: wrap("$", "$", "x^2") },
  { label: "Image", icon: ImageIcon, run: (s) => { const alt = s || "alt text"; return { text: `![${alt}](https://)`, selectInner: [2, 2 + alt.length] }; } },
];
const CALLOUTS: Tool[] = [
  { label: "Definition", icon: BookMarked, run: callout("definition", "Term — meaning") },
  { label: "Tip", icon: Lightbulb, run: callout("tip", "Exam tip") },
  { label: "Warning", icon: AlertTriangle, run: callout("warning", "Common mistake") },
  { label: "Example", icon: PenLine, run: callout("example", "Worked example") },
  { label: "Key concept", icon: Sparkles, run: callout("key-concept", "Key takeaway") },
];

export function MarkdownEditor({ id, value, onChange, rows = 12, full, sideBySide, placeholder }: { id: string; value: string; onChange: (v: string) => void; rows?: number; full?: boolean; sideBySide?: boolean; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const desktop = useIsDesktop();
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const split = !!sideBySide && desktop;

  const apply = (tool: Tool) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const { text, selectInner } = tool.run(value.slice(start, end));
    onChange(value.slice(0, start) + text + value.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      if (selectInner && selectInner[1] > 0) el.setSelectionRange(start + selectInner[0], start + selectInner[1]);
      else el.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const showEdit = split || mode === "edit";
  const showPreview = split || mode === "preview";

  return (
    <div className="space-y-2">
      {!split && (
        <Segmented<"edit" | "preview"> label="Editor mode" value={mode} onChange={setMode} className="max-w-xs" options={[{ value: "edit", label: "Edit", icon: Pencil }, { value: "preview", label: "Preview", icon: Eye }]} />
      )}
      {full && showEdit && (
        <div role="toolbar" aria-label="Formatting" className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {FORMAT.map((t) => (
            <button key={t.label} type="button" aria-label={t.label} title={t.label} onClick={() => apply(t)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground transition active:scale-95 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <t.icon className="h-5 w-5" aria-hidden />
            </button>
          ))}
          <span className="mx-1 w-px shrink-0 bg-border" aria-hidden />
          {CALLOUTS.map((t) => (
            <button key={t.label} type="button" onClick={() => apply(t)} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-muted px-3 text-xs font-bold text-foreground transition active:scale-95 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <t.icon className="h-4 w-4" aria-hidden />
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div className={cn(split && "grid grid-cols-2 gap-4")}>
        {showEdit && <textarea ref={ref} id={id} aria-label="Markdown" rows={rows} className={cn(areaCls, "font-mono leading-relaxed")} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "Write in Markdown…"} spellCheck />}
        {showPreview && (
          <div className={cn("min-h-[8rem] overflow-auto rounded-lg border border-border bg-background p-3", split && "max-h-[70dvh]")} aria-label="Preview">
            {value.trim() ? <Markdown source={value} /> : <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
