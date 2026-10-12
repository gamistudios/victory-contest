import { Clapperboard, Link2, Plus, Trash2, User, Video, X, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/academy/components/States";
import { cn } from "@/lib/utils";
import type { VideoLesson } from "@/types/academy";
import { Field, IconBtn, Panel, PanelTitle, inputCls } from "../components/kit";
import { uid } from "../components/kit";
import { MarkdownEditor } from "./MarkdownEditor";
import { clock, detectVideoType, emptyVideo, isHttpUrl, parseClock, youTubeId } from "./helpers";
import { ClockInput, type TabProps } from "./parts";

export function VideoTab({ m, set, errors }: TabProps) {
  const v = m.video_lesson;
  if (!v) {
    return (
      <EmptyState
        icon={<Video className="h-6 w-6" />}
        title="No video yet"
        hint="Add a YouTube link or a direct video file."
        action={
          <Button className="mt-2 h-11" onClick={() => set({ video_lesson: emptyVideo() })}>
            <Plus className="h-4 w-4" aria-hidden /> Add video
          </Button>
        }
      />
    );
  }
  const patch = (p: Partial<VideoLesson>) => set({ video_lesson: { ...v, ...p } });
  const url = v.url.trim();
  const type = detectVideoType(url);
  const ytId = youTubeId(url);
  const canPreview = isHttpUrl(url) && (type === "direct" || !!ytId);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Panel className="space-y-4">
          <PanelTitle icon={Clapperboard} action={<IconBtn label="Remove video" icon={Trash2} tone="danger" onClick={() => set({ video_lesson: null })} />}>
            Video
          </PanelTitle>
          <Field label="Video link" htmlFor="v-url" error={errors.videoUrl}>
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input id="v-url" type="url" inputMode="url" className={`${inputCls} pl-9`} value={v.url} onChange={(e) => patch({ url: e.target.value, type: detectVideoType(e.target.value) })} placeholder="https://youtu.be/… or https://…/file.mp4" aria-invalid={!!errors.videoUrl} />
            </div>
            {url && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${type === "youtube" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                {type === "youtube" ? <PlayCircle className="h-3.5 w-3.5" aria-hidden /> : <Video className="h-3.5 w-3.5" aria-hidden />}
                {type === "youtube" ? "YouTube" : "Direct file"} detected
              </span>
            )}
          </Field>
          {canPreview && (
            <div className="aspect-video w-full overflow-hidden rounded-xl bg-muted">
              {type === "youtube" && ytId ? (
                <iframe title="Video preview" className="h-full w-full" src={`https://www.youtube.com/embed/${ytId}`} allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
              ) : (
                <video className="h-full w-full" src={url} controls preload="metadata" aria-label="Video preview" />
              )}
            </div>
          )}
          <Field label="Title" htmlFor="v-title" error={errors.videoTitle}>
            <input id="v-title" className={inputCls} value={v.title} onChange={(e) => patch({ title: e.target.value })} aria-invalid={!!errors.videoTitle} />
          </Field>
          <Field label="Length" htmlFor="v-dur" hint="mm:ss">
            <ClockInput id="v-dur" label="Video length" seconds={v.duration_seconds} onCommit={(n) => patch({ duration_seconds: n })} />
          </Field>
        </Panel>

        <Panel className="space-y-4">
          <PanelTitle icon={User}>Instructor</PanelTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="v-inst">
              <input id="v-inst" className={inputCls} value={v.instructor_name} onChange={(e) => patch({ instructor_name: e.target.value })} />
            </Field>
            <Field label="Role" htmlFor="v-role">
              <input id="v-role" className={inputCls} value={v.instructor_role} onChange={(e) => patch({ instructor_role: e.target.value })} placeholder="Maths teacher" />
            </Field>
          </div>
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel>
          <PanelTitle>Description</PanelTitle>
          <MarkdownEditor id="v-desc" rows={5} value={v.description} onChange={(d) => patch({ description: d })} />
        </Panel>
        <Panel>
          <PanelTitle>Transcript</PanelTitle>
          {errors.transcript && (
            <p role="alert" className="mb-2 text-xs font-semibold text-destructive">
              {errors.transcript}
            </p>
          )}
          <ul className="space-y-2">
            {v.transcript.map((t, i) => {
              const invalid = parseClock(t.time_str) === null;
              const upd = (p: Partial<typeof t>) => patch({ transcript: v.transcript.map((x, j) => (j === i ? { ...x, ...p } : x)) });
              return (
                <li key={t.id} className="flex items-start gap-2">
                  <input
                    aria-label={`Timestamp ${i + 1}`}
                    aria-invalid={invalid}
                    inputMode="numeric"
                    className={cn(
                      "h-11 w-20 shrink-0 rounded-lg border border-input bg-background px-2 text-center font-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-24",
                      invalid && "border-destructive focus-visible:ring-destructive",
                    )}
                    value={t.time_str}
                    placeholder="0:00"
                    onChange={(e) => upd({ time_str: e.target.value, timestamp_seconds: parseClock(e.target.value) ?? t.timestamp_seconds })}
                  />
                  <textarea
                    aria-label={`Transcript text ${i + 1}`}
                    rows={2}
                    className="min-h-11 flex-1 min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
                    value={t.text}
                    placeholder="Spoken text at this timestamp..."
                    onChange={(e) => upd({ text: e.target.value })}
                  />
                  <IconBtn
                    label={`Remove line ${i + 1}`}
                    icon={X}
                    tone="danger"
                    className="shrink-0"
                    onClick={() => patch({ transcript: v.transcript.filter((_, j) => j !== i) })}
                  />
                </li>
              );
            })}
          </ul>
          <Button
            type="button"
            variant="outline"
            className="mt-3 h-11"
            onClick={() => {
              const last = v.transcript[v.transcript.length - 1];
              const next = last ? (parseClock(last.time_str) ?? last.timestamp_seconds) + 30 : 0;
              patch({ transcript: [...v.transcript, { id: uid("tr"), timestamp_seconds: next, time_str: clock(next), text: "" }] });
            }}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add line
          </Button>
        </Panel>
      </div>
    </div>
  );
}
