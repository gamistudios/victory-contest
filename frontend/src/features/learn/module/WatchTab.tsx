import { ChevronDown, Maximize, Play, PlayCircle, Video as VideoIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LearningModule } from "@/types/academy";
import { Markdown } from "../components/Markdown";
import { Watermark } from "../components/ProtectedContent";
import { useAcademy } from "../context/AcademyContext";
import { fmtClock } from "../lib/theme";
import { postModuleProgress } from "@/services/academy/academyApi";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

interface Props {
  module: LearningModule;
  initialSeconds: number;
  completed: boolean;
  onCompleted: () => void;
}

export function WatchTab({ module: m, initialSeconds, completed, onCompleted }: Props) {
  const v = m.video_lesson!;
  const { student, prefs } = useAcademy();
  const box = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const lastSaved = useRef(0);
  const yt = v.type === "youtube" ? youtubeId(v.url) : null;
  const [loaded, setLoaded] = useState(!prefs.dataSaver);
  const [failed, setFailed] = useState(false);
  const [tOpen, setTOpen] = useState(false);
  const [now, setNow] = useState(initialSeconds);

  useEffect(() => () => {
    // flush position when leaving the tab
    if (vid.current && vid.current.currentTime > 1) postModuleProgress(m.id, { video_time_seconds: Math.floor(vid.current.currentTime) }).catch(() => undefined);
  }, [m.id]);

  const fullscreen = () => {
    const el = box.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else (el.requestFullscreen?.() ?? Promise.resolve()).catch(() => vid.current?.requestFullscreen?.());
  };

  const seek = (s: number) => {
    if (vid.current) {
      vid.current.currentTime = s;
      vid.current.play().catch(() => undefined);
    }
  };

  // A rejected completion used to be an unhandled promise rejection (the "Mark as
  // watched" button) or silently swallowed (onEnded): the lesson stayed unfinished
  // with no clue why. Time flushes above stay quiet so they can't toast per tick.
  const reportWatched = (seconds: number | null) => {
    postModuleProgress(m.id, { video_completed: true, ...(seconds != null ? { video_time_seconds: seconds } : {}) })
      .then(onCompleted)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not save your progress"));
  };

  const pct = v.duration_seconds ? Math.min(100, Math.round((now / v.duration_seconds) * 100)) : 0;
  const stamp = student ? `${student.full_name} · ${student.id}` : "Victory Academy";

  return (
    <div className="space-y-4">
      <div ref={box} className="relative overflow-hidden rounded-2xl bg-gray-fix-950 [&:fullscreen]:rounded-none" onContextMenu={(e) => e.preventDefault()}>
        <div className="aspect-video w-full">
          {!loaded ? (
            <button onClick={() => setLoaded(true)} className="flex h-full w-full flex-col items-center justify-center gap-2 text-white">
              <PlayCircle className="h-16 w-16" />
              <span className="text-sm font-bold">Tap to load video</span>
              <span className="text-xs text-white/70">Data saver is on</span>
            </button>
          ) : yt ? (
            <iframe
              title={v.title}
              src={`https://www.youtube-nocookie.com/embed/${yt}?rel=0&modestbranding=1&playsinline=1`}
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              className="h-full w-full"
            />
          ) : failed ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-white"><VideoIcon className="h-10 w-10 opacity-70" /><p className="text-sm font-bold">Video can't be played right now</p><p className="text-xs text-white/70">Check your connection and try again.</p></div>
          ) : (
            <video
              ref={vid}
              src={v.url}
              controls
              playsInline
              preload={prefs.dataSaver ? "none" : "metadata"}
              controlsList="nodownload noplaybackrate"
              disablePictureInPicture
              onError={() => setFailed(true)}
              onLoadedMetadata={(e) => { if (initialSeconds > 5 && !completed) e.currentTarget.currentTime = initialSeconds; }}
              onTimeUpdate={(e) => {
                const t = e.currentTarget.currentTime;
                setNow(t);
                if (t - lastSaved.current > 5) {
                  lastSaved.current = t;
                  postModuleProgress(m.id, { video_time_seconds: Math.floor(t) }).catch(() => undefined);
                }
              }}
              onEnded={() => reportWatched(v.duration_seconds)}
              className="h-full w-full"
            />
          )}
        </div>
        <Watermark text={stamp} />
        <button onClick={fullscreen} aria-label="Fullscreen" className="absolute right-2 top-2 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-gray-fix-900/70 text-white backdrop-blur"><Maximize className="h-5 w-5" /></button>
      </div>

      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-extrabold text-blue-700">{v.instructor_name.split(" ").filter((w) => /^[A-Z]/.test(w)).slice(-2).map((w) => w[0]).join("")}</span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-bold leading-tight">{v.title}</p>
          <p className="truncate text-xs text-muted-foreground">{v.instructor_name} · {fmtClock(v.duration_seconds)}</p>
        </div>
        {completed && <span className="rounded-full bg-green-100 px-2 py-1 text-[11px] font-bold text-green-800">Watched</span>}
      </div>

      {!completed && pct > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-brand" style={{ width: `${pct}%` }} /></div>{pct}%</div>
      )}
      {(yt || failed) && !completed && (
        <Button variant="outline" className="h-11 w-full" onClick={() => reportWatched(null)}>Mark video as watched</Button>
      )}

      {v.description && <div className="rounded-2xl border border-border bg-card p-4"><Markdown source={v.description} className="text-[0.95em]" /></div>}

      {v.transcript.length > 0 && (
        <div className="rounded-2xl border border-border bg-card">
          <button onClick={() => setTOpen((o) => !o)} aria-expanded={tOpen} className="flex w-full items-center gap-2 p-3 text-left">
            <span className="flex-1 text-sm font-bold">Transcript</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", tOpen && "rotate-180")} />
          </button>
          {tOpen && (
            <ul className="divide-y divide-border border-t border-border">
              {v.transcript.map((t) => (
                <li key={t.id}>
                  <button onClick={() => seek(t.timestamp_seconds)} className="flex w-full gap-3 px-3 py-2.5 text-left text-sm active:bg-muted">
                    <span className="flex shrink-0 items-center gap-1 font-mono text-xs font-bold text-blue-700"><Play className="h-3 w-3 fill-current" />{t.time_str}</span>
                    <span>{t.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
