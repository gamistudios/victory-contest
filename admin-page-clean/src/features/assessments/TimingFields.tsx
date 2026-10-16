import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface Phase2Fields {
  kind?: string; mode?: "self_paced" | "global"; duration_minutes?: number; late_penalty_percent?: number;
  reveal?: "at_end" | "on_submit"; shuffle_questions?: boolean; shuffle_options?: boolean; year?: string; source?: string;
}
const sel = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

const hint = "text-xs text-muted-foreground";

/** Timing + assessment settings step (plan §7.3). Self-paced is the default mode. */
export default function TimingFields({ value, onChange, disabled }: { value: Phase2Fields; onChange: (p: Partial<Phase2Fields>) => void; disabled?: boolean }) {
  const self = (value.mode ?? "self_paced") === "self_paced";
  const check = "flex items-start gap-3 rounded-md border p-3 text-sm";
  return (
    <div className="space-y-4 rounded-lg border p-3">
      <div className="grid gap-4 grid-cols-1">
        <div className="space-y-1"><Label>Kind</Label>
          <select className={sel} disabled={disabled} value={value.kind ?? "contest"} onChange={(e) => onChange({ kind: e.target.value })}>
            {["contest", "practice", "entrance", "past_exam", "makeup", "other"].map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}
          </select>
          <p className={hint}>What type of assessment this is. Used for filtering.</p></div>
        <div className="space-y-1"><Label>Mode</Label>
          <select className={sel} disabled={disabled} value={value.mode ?? "self_paced"} onChange={(e) => onChange({ mode: e.target.value as Phase2Fields["mode"] })}>
            <option value="self_paced">Self-paced</option>
            <option value="global">Global</option>
          </select>
          <p className={hint}>{self ? "Each student starts any time and gets their own timer." : "Everyone must finish by the end time."}</p></div>
      </div>

      <div className="grid gap-4 grid-cols-1">
        <div className="space-y-1"><Label>Time limit (minutes)</Label>
          <Input type="number" min={1} disabled={disabled} value={value.duration_minutes ?? 60} onChange={(e) => onChange({ duration_minutes: Number(e.target.value) })} />
          <p className={hint}>Per student, counted from when they press Start.</p></div>
        {self && <div className="space-y-1"><Label>Late penalty (%)</Label>
          <Input type="number" min={0} max={100} disabled={disabled} value={value.late_penalty_percent ?? 10} onChange={(e) => onChange({ late_penalty_percent: Number(e.target.value) })} />
          <p className={hint}>Points taken off if they start after the end time.</p></div>}
      </div>

      <div className="space-y-1"><Label>When are answers revealed?</Label>
        <select className={sel} disabled={disabled} value={value.reveal ?? "at_end"} onChange={(e) => onChange({ reveal: e.target.value as Phase2Fields["reveal"] })}>
          <option value="at_end">After the end time</option><option value="on_submit">Right after the student submits</option>
        </select></div>

      <div className="space-y-3 border-t pt-3">
        <p className="text-sm font-medium">Optional details <span className="font-normal text-muted-foreground">(for past exams and entrance exams)</span></p>
        <div className="space-y-1"><Label>Source</Label>
          <Input placeholder="e.g. EUEE, Ministry exam" disabled={disabled} value={value.source ?? ""} onChange={(e) => onChange({ source: e.target.value })} />
          <p className={hint}>Where the questions come from. Leave empty for regular contests.</p></div>
        <div className="space-y-1"><Label>Exam year</Label>
          <Input placeholder="e.g. 2018 E.C." disabled={disabled} value={value.year ?? ""} onChange={(e) => onChange({ year: e.target.value })} />
          <p className={hint}>Which year's exam it was. Saved with the contest; not shown to students yet.</p></div>
      </div>

      <div className="space-y-2">
        <label className={check}><input type="checkbox" className="mt-0.5 h-4 w-4" disabled={disabled} checked={!!value.shuffle_questions} onChange={(e) => onChange({ shuffle_questions: e.target.checked })} />
          <span><span className="block font-medium">Shuffle questions</span><span className={hint}>Each student sees the questions in a different order.</span></span></label>
        <label className={check}><input type="checkbox" className="mt-0.5 h-4 w-4" disabled={disabled} checked={!!value.shuffle_options} onChange={(e) => onChange({ shuffle_options: e.target.checked })} />
          <span><span className="block font-medium">Shuffle options</span><span className={hint}>The answer choices (A, B, C, D) are mixed for each student.</span></span></label>
      </div>

      <p className={hint}>Opens at = start time. End time = when answers are revealed{self ? "; students may still start afterwards but lose the late penalty" : ""}.</p>
    </div>
  );
}
