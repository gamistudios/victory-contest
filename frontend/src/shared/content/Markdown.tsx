import { Fragment, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { AlertTriangle, BookMarked, Info, Lightbulb, PenLine, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ZoomableImage } from "@/features/learn/components/ImageViewer";

const CALLOUTS: Record<string, { label: string; icon: LucideIcon; cls: string }> = {
  definition: { label: "Definition", icon: BookMarked, cls: "border-blue-300 bg-blue-50 text-blue-950" },
  tip: { label: "Exam tip", icon: Lightbulb, cls: "border-emerald-300 bg-emerald-50 text-emerald-950" },
  warning: { label: "Watch out", icon: AlertTriangle, cls: "border-amber-300 bg-amber-50 text-amber-950" },
  example: { label: "Example", icon: PenLine, cls: "border-violet-300 bg-violet-50 text-violet-950" },
  "key-concept": { label: "Key takeaways", icon: Sparkles, cls: "border-indigo-300 bg-indigo-50 text-indigo-950" },
  note: { label: "Note", icon: Info, cls: "border-gray-300 bg-gray-50 text-gray-900" },
};

type Seg = { type: "md"; text: string } | { type: "callout"; kind: string; text: string };

function split(src: string): Seg[] {
  const out: Seg[] = [];
  const lines = src.split("\n");
  let buf: string[] = [];
  const flush = () => {
    if (buf.join("").trim()) out.push({ type: "md", text: buf.join("\n") });
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(":::")) {
      flush();
      const kind = lines[i].slice(3).trim().toLowerCase() || "note";
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(":::")) body.push(lines[i++]);
      out.push({ type: "callout", kind, text: body.join("\n") });
    } else buf.push(lines[i]);
  }
  flush();
  return out;
}

function Md({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        img: ({ src, alt }) => <ZoomableImage src={typeof src === "string" ? src : undefined} alt={alt} />,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 underline underline-offset-2">
            {children}
          </a>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

/** Markdown + KaTeX + `:::callout` blocks (definition, tip, warning, example, key-concept). */
export function Markdown({ source, className }: { source: string; className?: string }) {
  // `?? ""` keeps a missing body (an old row, a field the admin left empty) from
  // throwing inside split() and taking the whole lesson down with it.
  const segs = useMemo(() => split(source ?? ""), [source]);
  return (
    <div className={cn("reader", className)}>
      {segs.map((s, i) =>
        s.type === "md" ? (
          <Fragment key={i}>
            <Md text={s.text} />
          </Fragment>
        ) : (
          <Callout key={i} kind={s.kind} text={s.text} />
        ),
      )}
    </div>
  );
}

function Callout({ kind, text }: { kind: string; text: string }) {
  const c = CALLOUTS[kind] ?? CALLOUTS.note;
  const Icon = c.icon;
  return (
    <aside className={cn("my-4 rounded-2xl border-l-4 p-4 [&_p]:my-1.5 [&_.katex-display]:my-1", c.cls)}>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider opacity-80">
        <Icon className="h-4 w-4" aria-hidden />
        {c.label}
      </div>
      <Md text={text} />
    </aside>
  );
}
