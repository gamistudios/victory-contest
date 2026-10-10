import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Shared markdown component map so chat messages render with the same look
// as article prose (ArticleView.tsx uses the matching "prose" class set).
// Kept in one place so a style tweak updates both.
const markdownComponents = {
  // Headings
  h1: (props: React.HTMLAttributes<HTMLElement>) => (
    <h1 className="text-xl font-bold text-gray-900 mt-4 mb-2 first:mt-0" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLElement>) => (
    <h2 className="text-lg font-bold text-gray-900 mt-4 mb-2 first:mt-0" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLElement>) => (
    <h3 className="text-base font-bold text-gray-900 mt-3 mb-1 first:mt-0" {...props} />
  ),
  h4: (props: React.HTMLAttributes<HTMLElement>) => (
    <h4 className="text-sm font-bold text-gray-800 mt-2 mb-1" {...props} />
  ),
  // Body
  p: (props: React.HTMLAttributes<HTMLElement>) => (
    <p className="text-sm text-gray-700 leading-relaxed my-2" {...props} />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-gray-900" {...props} />
  ),
  em: (props: React.HTMLAttributes<HTMLElement>) => (
    <em className="italic" {...props} />
  ),
  // Lists
  ul: (props: React.HTMLAttributes<HTMLElement>) => (
    <ul className="list-disc pl-6 my-2 space-y-1 text-sm text-gray-700" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLElement>) => (
    <ol className="list-decimal pl-6 my-2 space-y-1 text-sm text-gray-700" {...props} />
  ),
  li: (props: React.HTMLAttributes<HTMLElement>) => (
    <li className="leading-relaxed" {...props} />
  ),
  // Inline + block code
  code: (props: React.HTMLAttributes<HTMLElement>) => {
    const isBlock =
      props.className?.includes("language-") ||
      String(props.children || "").includes("\n");
    if (isBlock) {
      return (
        <code
          className="block w-full bg-gray-fix-900 text-gray-fix-100 text-xs rounded-lg p-3 overflow-x-auto my-2 font-mono"
          {...props}
        />
      );
    }
    return (
      <code
        className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-xs font-mono"
        {...props}
      />
    );
  },
  pre: (props: React.HTMLAttributes<HTMLElement>) => (
    <pre className="w-full my-2" {...props} />
  ),
  // Tables (remark-gfm)
  table: (props: React.HTMLAttributes<HTMLElement>) => (
    <table className="w-full border-collapse my-2 text-xs" {...props} />
  ),
  thead: (props: React.HTMLAttributes<HTMLElement>) => (
    <thead className="bg-gray-50" {...props} />
  ),
  th: (props: React.HTMLAttributes<HTMLElement>) => (
    <th
      className="border border-gray-200 px-2 py-1 text-left font-semibold"
      {...props}
    />
  ),
  td: (props: React.HTMLAttributes<HTMLElement>) => (
    <td
      className="border border-gray-200 px-2 py-1 align-top"
      {...props}
    />
  ),
  // Misc
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      className="text-blue-600 underline"
      target="_blank"
      rel="noreferrer noopener"
      {...props}
    />
  ),
  blockquote: (props: React.HTMLAttributes<HTMLElement>) => (
    <blockquote
      className="border-l-4 border-blue-400 pl-3 py-1 my-2 text-sm text-blue-700 bg-blue-50 rounded-r"
      {...props}
    />
  ),
  hr: (props: React.HTMLAttributes<HTMLElement>) => (
    <hr className="border-gray-200 my-3" {...props} />
  ),
};

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

// Renders an LLM markdown reply. react-markdown escapes raw HTML by default
// (no rehype-raw), so the output is safe without an extra DOMPurify pass.
export default function MarkdownMessage({ content, className = "" }: MarkdownMessageProps) {
  const remarkPlugins = useMemo(() => [remarkGfm], []);
  return (
    <div className={`article-content markdown-message ${className}`}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={markdownComponents as never}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
