import { Markdown } from "@/shared/content/Markdown";
import { cn } from "@/lib/utils";

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

/**
 * Chat markdown now renders through the Academy viewer, so AI answers get the
 * same typography, KaTeX math, tables and `:::callout` blocks as lessons.
 */
export default function MarkdownMessage({ content, className = "" }: MarkdownMessageProps) {
  return <Markdown source={content} className={cn("markdown-message !text-sm", className)} />;
}
