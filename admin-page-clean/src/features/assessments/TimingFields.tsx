import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface Phase2Fields {
  kind?: string; mode?: "self_paced" | "global"; duration_minutes?: number; late_penalty_percent?: number;
  reveal?: "at_end" | "on_submit"; shuffle_questions?: boolean; shuffle_options?: boolean; year?: string; source?: string;
}
const sel = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Timing + assessment settings step (plan §7.3). Self-paced is the default mode. */
export default function TimingFields({ value, onChange, disabled }: { value: Phase2Fields; onChange: (p: Partial<Phase2Fields>) => void; disabled?: boolean }) {
  const self = (value.mode ?? "self_paced") === "self_paced";
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label>Kind</Label>
          <select className={sel} disabled={disabled} value={value.kind ?? "contest"} onChange={(e) => onChange({ kind: e.target.value })}>
            {["contest", "practice", "entrance", "past_exam", "makeup", "other"].map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}
          </select></div>
        <div className="space-y-1"><Label>Mode</Label>
          <select className={sel} disabled={disabled} value={value.mode ?? "self_paced"} onChange={(e) => onChange({ mode: e.target.value as Phase2Fields["mode"] })}>
            <option value="self_paced">Self-paced (start any time)</option>
            <option value="global">Global (everyone ends together)</option>
          </select></div>
        <div className="space-y-1"><Label>Time limit per student (minutes)</Label>
          <Input type="number" min={1} disabled={disabled} value={value.duration_minutes ?? 60} onChange={(e) => onChange({ duration_minutes: Number(e.target.value) })} /></div>
        {self && <div className="space-y-1"><Label>Late penalty %</Label>
          <Input type="number" min={0} max={100} disabled={disabled} value={value.late_penalty_percent ?? 10} onChange={(e) => onChange({ late_penalty_percent: Number(e.target.value) })} /></div>}
        <div className="space-y-1"><Label>Answers revealed</Label>
          <select className={sel} disabled={disabled} value={value.reveal ?? "at_end"} onChange={(e) => onChange({ reveal: e.target.value as Phase2Fields["reveal"] })}>
            <option value="at_end">At the “until” time</option><option value="on_submit">Right after submit</option>
          </select></div>
        <div className="space-y-1"><Label>Source / year</Label>
          <div className="flex gap-2">
            <Input placeholder="EUEE 2018 E.C." disabled={disabled} value={value.source ?? ""} onChange={(e) => onChange({ source: e.target.value })} />
            <Input placeholder="Year" className="w-24" disabled={disabled} value={value.year ?? ""} onChange={(e) => onChange({ year: e.target.value })} />
          </div></div>
      </div>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" disabled={disabled} checked={!!value.shuffle_questions} onChange={(e) => onChange({ shuffle_questions: e.target.checked })} />Shuffle questions</label>
        <label className="flex items-center gap-2"><input type="checkbox" disabled={disabled} checked={!!value.shuffle_options} onChange={(e) => onChange({ shuffle_options: e.target.checked })} />Shuffle options</label>
      </div>
      <p className="text-xs text-muted-foreground">Opens at = start time. On-time until / answers revealed at = end time{self ? "; students may still start afterwards but lose the late penalty" : ""}.</p>
    </div>
  );
}
