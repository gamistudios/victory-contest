import { useState } from "react";
import { Layers, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/academy/components/States";
import type { Difficulty, Flashcard } from "@/types/academy";
import { Chip, Field, areaCls, uid } from "../components/kit";
import { Expandable } from "./parts";

const DIFFS: Difficulty[] = ["Easy", "Medium", "Hard"];

export function FlashcardsEditor({ cards, moduleId, onChange }: { cards: Flashcard[]; moduleId: string; onChange: (c: Flashcard[]) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const upd = (id: string, p: Partial<Flashcard>) => onChange(cards.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const add = () => {
    const c: Flashcard = { id: uid("fc"), question: "", answer: "", explanation: "", difficulty: "Medium", source_module_id: moduleId, source_section: "", tags: [] };
    onChange([...cards, c]);
    setOpenId(c.id);
  };
  return (
    <div className="space-y-2">
      {cards.length === 0 && <EmptyState icon={<Layers className="h-6 w-6" />} title="No flashcards" hint="Add one by hand or generate drafts with AI." />}
      {cards.map((c, i) => (
        <Expandable
          key={c.id}
          open={openId === c.id}
          onToggle={() => setOpenId(openId === c.id ? null : c.id)}
          summary={
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>
              <p className="truncate text-sm font-semibold text-foreground">{c.question || "New card"}</p>
            </div>
          }
        >
          <Field label="Question" htmlFor={`${c.id}-q`}>
            <textarea id={`${c.id}-q`} rows={2} className={areaCls} value={c.question} onChange={(e) => upd(c.id, { question: e.target.value })} />
          </Field>
          <Field label="Answer" htmlFor={`${c.id}-a`}>
            <textarea id={`${c.id}-a`} rows={2} className={areaCls} value={c.answer} onChange={(e) => upd(c.id, { answer: e.target.value })} />
          </Field>
          <Field label="Explanation" htmlFor={`${c.id}-e`}>
            <textarea id={`${c.id}-e`} rows={2} className={areaCls} value={c.explanation} onChange={(e) => upd(c.id, { explanation: e.target.value })} />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2" role="group" aria-label="Difficulty">
              {DIFFS.map((d) => (
                <Chip key={d} active={c.difficulty === d} onClick={() => upd(c.id, { difficulty: d })}>
                  {d}
                </Chip>
              ))}
            </div>
            <Button type="button" variant="ghost" className="h-11 text-destructive hover:text-destructive" onClick={() => onChange(cards.filter((x) => x.id !== c.id))}>
              <Trash2 className="h-4 w-4" aria-hidden /> Remove
            </Button>
          </div>
        </Expandable>
      ))}
      <Button type="button" variant="outline" className="h-11" onClick={add}>
        <Plus className="h-4 w-4" aria-hidden /> Add flashcard
      </Button>
    </div>
  );
}
