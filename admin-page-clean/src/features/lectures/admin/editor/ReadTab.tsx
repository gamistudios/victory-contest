import { useState } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/features/lectures/components/Markdown";
import { FormSheet, Panel, PanelTitle } from "../components/kit";
import { MarkdownEditor } from "./MarkdownEditor";
import type { TabProps } from "./parts";

export function ReadTab({ m, set }: TabProps) {
  const [preview, setPreview] = useState(false);
  return (
    <Panel>
      <PanelTitle
        action={
          <Button type="button" variant="outline" className="h-11" onClick={() => setPreview(true)}>
            <Smartphone className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Preview as</span> student
          </Button>
        }
      >
        Reading
      </PanelTitle>
      <MarkdownEditor id="m-reading" full sideBySide rows={18} value={m.reading_markdown} onChange={(v) => set({ reading_markdown: v })} />
      <FormSheet open={preview} onOpenChange={setPreview} title="Student view" description={m.title || "Untitled module"} tall>
        <article className="mx-auto max-w-xl pb-6">
          <h1 className="mb-3 font-nunito-sans text-2xl font-extrabold text-foreground">{m.title || "Untitled module"}</h1>
          {m.reading_markdown.trim() ? <Markdown source={m.reading_markdown} /> : <p className="text-sm text-muted-foreground">No reading content yet.</p>}
        </article>
      </FormSheet>
    </Panel>
  );
}
