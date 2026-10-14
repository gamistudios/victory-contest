import { Plus, Target, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { levelShort } from "@/academy/lib/theme";
import type { Difficulty } from "@/types/academy";
import { Chip, Field, IconBtn, Panel, PanelTitle, Stepper, inputCls } from "../components/kit";
import { MarkdownEditor } from "./MarkdownEditor";
import type { TabProps } from "./parts";

const LEVELS: Difficulty[] = ["Beginner", "Intermediate", "Advanced"];

export function BasicsTab({ m, set, errors, tree }: TabProps) {
  const difficulties = LEVELS.includes(m.difficulty) ? LEVELS : [...LEVELS, m.difficulty];
  const objectives = m.learning_objectives;
  const setObj = (i: number, v: string) => set({ learning_objectives: objectives.map((o, j) => (j === i ? v : o)) });

  return (
    <div className="space-y-4">
      <Panel className="space-y-4">
        <Field label="Title" htmlFor="m-title" error={errors.title}>
          <input id="m-title" className={inputCls} value={m.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Arithmetic sequences" aria-invalid={!!errors.title} aria-required />
        </Field>
        <Field label="Chapter" htmlFor="m-chapter" error={errors.chapter}>
          <Select
            value={m.chapter_id}
            onValueChange={(id) => {
              const hit = tree.flatMap((s) => s.chapters.map((c) => ({ s, c }))).find((x) => x.c.id === id);
              if (hit) set({ chapter_id: id, subject_id: hit.s.id, stream_id: hit.s.stream_id, level_id: hit.s.level_id });
            }}
          >
            <SelectTrigger id="m-chapter" className="h-11">
              <SelectValue placeholder="Pick a chapter" />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {tree.map((s) => (
                <SelectGroup key={s.id}>
                  <SelectLabel>
                    {s.name} · {levelShort(undefined, s.level_id)}
                  </SelectLabel>
                  {s.chapters.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="min-h-11">
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Difficulty">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Difficulty">
            {difficulties.map((d) => (
              <Chip key={d} active={m.difficulty === d} onClick={() => set({ difficulty: d })}>
                {d}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Study time">
          <Stepper label="minutes" suffix="min" value={m.estimated_minutes} min={1} max={240} step={5} onChange={(n) => set({ estimated_minutes: n })} />
        </Field>
      </Panel>

      <Panel>
        <PanelTitle>Short description</PanelTitle>
        <MarkdownEditor id="m-desc" value={m.description} onChange={(v) => set({ description: v })} rows={4} placeholder="One or two lines students see in the outline" />
      </Panel>

      <Panel>
        <PanelTitle icon={Target}>Learning objectives</PanelTitle>
        <ul className="space-y-2">
          {objectives.map((o, i) => (
            <li key={i} className="flex items-center gap-2">
              <input aria-label={`Objective ${i + 1}`} className={inputCls} value={o} onChange={(e) => setObj(i, e.target.value)} placeholder="Students can…" />
              <IconBtn label={`Remove objective ${i + 1}`} icon={X} tone="danger" onClick={() => set({ learning_objectives: objectives.filter((_, j) => j !== i) })} />
            </li>
          ))}
        </ul>
        <Button type="button" variant="outline" className="mt-3 h-11" onClick={() => set({ learning_objectives: [...objectives, ""] })}>
          <Plus className="h-4 w-4" aria-hidden /> Add objective
        </Button>
      </Panel>
    </div>
  );
}
