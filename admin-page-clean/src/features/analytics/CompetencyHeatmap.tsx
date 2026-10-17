// Competency heat-map: mastery (correct / answered) per subject, one coloured cell per chapter.
// An empty chapter id means attempts tagged to the subject as a whole.
import { useMemo } from "react";
import type { CompetencyCell } from "./api";

interface Props {
  cells: CompetencyCell[];
  names: { program: (id?: string) => string; subject: (id?: string) => string; chapter: (id?: string) => string };
}

// Red (0) -> amber -> green (100); light fills so the dark number stays readable.
const fill = (m: number, total: number) => (total <= 0 ? "hsl(0 0% 90%)" : `hsl(${Math.round((Math.max(0, Math.min(100, m)) / 100) * 120)} 70% 78%)`);

export default function CompetencyHeatmap({ cells, names }: Props) {
  const groups = useMemo(() => {
    const m = new Map<string, { program: string; subject: string; whole?: CompetencyCell; chapters: CompetencyCell[] }>();
    for (const c of cells) {
      const k = `${c.program_id}::${c.subject_id}`;
      const g = m.get(k) ?? { program: c.program_id, subject: c.subject_id, chapters: [] };
      if (c.chapter_id) g.chapters.push(c);
      else g.whole = c;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => names.subject(a.subject).localeCompare(names.subject(b.subject)));
  }, [cells, names]);

  if (groups.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No competency data in this scope yet.</p>;

  const tip = (c: CompetencyCell) => `${c.correct}/${c.total} correct · ${c.students} students · ${c.attempts} attempts`;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-hidden>
        <span>Low</span>
        <span className="h-2 w-40 rounded-full" style={{ background: "linear-gradient(90deg, hsl(0 70% 78%), hsl(60 70% 78%), hsl(120 70% 78%))" }} />
        <span>High mastery</span>
      </div>
      {groups.map((g) => (
        <div key={`${g.program}::${g.subject}`} className="rounded-xl border border-border p-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-nunito-sans text-sm font-bold text-foreground">
              {names.subject(g.subject)} <span className="text-xs font-normal text-muted-foreground">· {names.program(g.program)}</span>
            </p>
            {g.whole && <span className="rounded-full px-2 py-0.5 text-xs font-semibold text-foreground" style={{ background: fill(g.whole.mastery, g.whole.total) }} title={tip(g.whole)}>Whole subject {g.whole.mastery.toFixed(1)}%</span>}
          </div>
          {g.chapters.length === 0 ? (
            <p className="text-xs text-muted-foreground">No chapter-level questions answered yet.</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
              {[...g.chapters].sort((a, b) => names.chapter(a.chapter_id).localeCompare(names.chapter(b.chapter_id), undefined, { numeric: true })).map((c) => (
                <div key={c.chapter_id} className="rounded-lg p-2 text-foreground" style={{ background: fill(c.mastery, c.total) }} title={tip(c)}>
                  <p className="truncate text-[11px] font-semibold">{names.chapter(c.chapter_id)}</p>
                  <p className="text-base font-extrabold leading-tight">{c.total > 0 ? `${c.mastery.toFixed(0)}%` : "–"}</p>
                  <p className="text-[10px] opacity-70">{c.correct}/{c.total}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
