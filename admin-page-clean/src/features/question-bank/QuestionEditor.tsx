// Phase 3 question editor (plan 5.6): Markdown + math with live preview, bank metadata, verified toggle.
// Saves through the presence-aware PATCH, so only the fields shown here are touched.
import { useState } from "react";
import { Markdown } from "@/features/lectures/components/Markdown";
import { updateQuestion, getQuestionUsage } from "@/services/questionServices";
import type { Question } from "@/types/models";
import { Button } from "@/components/ui/button";

export default function QuestionEditor({ question, onSaved, onClose }: { question: Question; onSaved: () => void; onClose: () => void }) {
  const [text, setText] = useState(question.question_text ?? "");
  const [explanation, setExplanation] = useState(question.explanation ?? "");
  const [topic, setTopic] = useState(question.topic ?? "");
  const [difficulty, setDifficulty] = useState(question.difficulty ?? "");
  const [year, setYear] = useState(question.year ? String(question.year) : "");
  const [source, setSource] = useState(question.source ?? "");
  const [verified, setVerified] = useState(!!question.verified);
  const [usage, setUsage] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!question.id) return;
    setBusy(true); setError("");
    try {
      await updateQuestion(question.id, {
        question_text: text, explanation, topic, difficulty: difficulty as any,
        year: year ? Number(year) : 0, source, verified,
      });
      onSaved();
    } catch {
      setError("Could not save the question.");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 rounded border p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs font-medium">Question (Markdown, $math$)</label>
          <textarea className="h-40 w-full rounded border p-2 font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium">Preview</label>
          <div className="h-40 overflow-auto rounded border p-2"><Markdown source={text} /></div>
        </div>
        <div>
          <label className="text-xs font-medium">Explanation (Markdown)</label>
          <textarea className="h-28 w-full rounded border p-2 font-mono text-sm" value={explanation} onChange={(e) => setExplanation(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium">Explanation preview</label>
          <div className="h-28 overflow-auto rounded border p-2"><Markdown source={explanation} /></div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input className="rounded border p-2" placeholder="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <select className="rounded border p-2" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
          <option value="">Difficulty</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
        </select>
        <input className="w-24 rounded border p-2" placeholder="Year" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} />
        <input className="rounded border p-2" placeholder="Source" value={source} onChange={(e) => setSource(e.target.value)} />
        <label className="flex items-center gap-1"><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> Verified</label>
        <button className="text-xs underline" onClick={() => question.id && getQuestionUsage(question.id).then((u) => setUsage(u.count)).catch(() => setUsage(-1))}>
          {usage === null ? "Check usage" : usage < 0 ? "Usage unavailable" : `Used in ${usage} assessment${usage === 1 ? "" : "s"}`}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}
