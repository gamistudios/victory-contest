// Phase 3 question bank (plan 5.6): server-side filters, stream tabs Natural / Social / Common,
// Uncategorised queue, bulk "assign scope", and the Markdown+math editor.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryQuestions, assignQuestionScope, type QuestionQuery } from "@/services/questionServices";
import { getAdminCatalog } from "@/services/catalogServices";
import type { Question } from "@/types/models";
import { Button } from "@/components/ui/button";
import QuestionEditor from "./QuestionEditor";

type Tab = "all" | "natural-science" | "social-science" | "common" | "uncategorised";
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" }, { id: "natural-science", label: "Natural" },
  { id: "social-science", label: "Social" }, { id: "common", label: "Common" },
  { id: "uncategorised", label: "Uncategorised" },
];

export default function QuestionBankPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("all");
  const [program, setProgram] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [verified, setVerified] = useState<"" | "true" | "false">("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Question | null>(null);
  const [target, setTarget] = useState({ program_id: "", stream_id: "common", subject_id: "" });
  const [msg, setMsg] = useState("");

  const catalog = useQuery({ queryKey: ["admin-catalog"], queryFn: () => getAdminCatalog() });
  const programs = (catalog.data?.programs ?? []) as any[];
  const subjects = (catalog.data?.subjects ?? []) as any[];

  const params = useMemo<QuestionQuery>(() => {
    const p: QuestionQuery = { q: text || undefined, difficulty: difficulty || undefined, verified: verified || undefined };
    if (tab === "uncategorised") p.scoped = "none";
    else {
      if (program) p.program_id = program;
      if (subject) p.subject_id = subject;
      if (tab !== "all") p.stream_id = tab;
    }
    return p;
  }, [tab, program, subject, text, difficulty, verified]);

  const list = useQuery({ queryKey: ["question-bank", params], queryFn: () => queryQuestions(params) });
  const rows = list.data ?? [];

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const assign = async () => {
    if (!target.program_id || selected.size === 0) return;
    try {
      const r = await assignQuestionScope([...selected], {
        program_id: target.program_id, stream_id: target.stream_id || "common", subject_id: target.subject_id || undefined,
      } as any);
      setMsg(`Updated ${r.updated.length}, failed ${Object.keys(r.failed).length}.`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["question-bank"] });
    } catch { setMsg("Could not assign scope."); }
  };

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">Question bank</h1>
      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setSelected(new Set()); }}
            className={`rounded-full border px-3 py-1 text-sm ${tab === t.id ? "border-primary bg-primary/10 font-semibold" : ""}`}>{t.label}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {tab !== "uncategorised" && (
          <>
            <select className="rounded border p-2" value={program} onChange={(e) => { setProgram(e.target.value); setSubject(""); }}>
              <option value="">All programs</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.id}</option>)}
            </select>
            <select className="rounded border p-2" value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">All subjects</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </>
        )}
        <input className="rounded border p-2" placeholder="Search text / topic / source" value={text} onChange={(e) => setText(e.target.value)} />
        <select className="rounded border p-2" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
          <option value="">Any difficulty</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
        </select>
        <select className="rounded border p-2" value={verified} onChange={(e) => setVerified(e.target.value as any)}>
          <option value="">Verified: any</option><option value="true">Verified</option><option value="false">Unverified</option>
        </select>
      </div>
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded border bg-muted/40 p-2 text-sm">
          <span>{selected.size} selected → assign scope:</span>
          <select className="rounded border p-1" value={target.program_id} onChange={(e) => setTarget({ ...target, program_id: e.target.value })}>
            <option value="">Program</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.id}</option>)}
          </select>
          <select className="rounded border p-1" value={target.stream_id} onChange={(e) => setTarget({ ...target, stream_id: e.target.value })}>
            <option value="common">Common</option><option value="natural-science">Natural</option><option value="social-science">Social</option>
          </select>
          <select className="rounded border p-1" value={target.subject_id} onChange={(e) => setTarget({ ...target, subject_id: e.target.value })}>
            <option value="">No subject</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Button size="sm" onClick={assign} disabled={!target.program_id}>Assign</Button>
        </div>
      )}
      {msg && <p className="text-sm">{msg}</p>}
      {editing && <QuestionEditor question={editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["question-bank"] }); }} />}
      {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {list.isError && <p className="text-sm text-red-600">Could not load questions.</p>}
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left"><th className="p-2"></th><th>Question</th><th>Scope</th><th>Diff.</th><th>Verified</th><th></th></tr></thead>
        <tbody>
          {rows.map((q) => (
            <tr key={q.id} className="border-b align-top">
              <td className="p-2"><input type="checkbox" checked={!!q.id && selected.has(q.id)} onChange={() => q.id && toggle(q.id)} /></td>
              <td className="max-w-md truncate">{q.question_text}</td>
              <td>{(q as any).scope ? `${(q as any).scope.program_id}/${(q as any).scope.stream_id}` : "—"}</td>
              <td>{q.difficulty ?? ""}</td><td>{q.verified ? "yes" : ""}</td>
              <td><button className="underline" onClick={() => setEditing(q)}>Edit</button></td>
            </tr>
          ))}
          {!list.isLoading && rows.length === 0 && <tr><td className="p-2 text-muted-foreground" colSpan={6}>No questions match.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
