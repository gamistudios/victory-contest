import type { Access, AdminTreeSubject, LearningModule, ResourceKey, VideoLesson } from "@/types/academy";
import { uid } from "../components/kit";

export type TabId = "basics" | "read" | "video" | "docs" | "activities" | "access";

export interface Errors {
  title?: string;
  chapter?: string;
  videoUrl?: string;
  videoTitle?: string;
  transcript?: string;
  docs: Record<string, string>;
  quiz: Record<string, string>;
}

const YT = /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
export const youTubeId = (url: string): string | null => url.match(YT)?.[1] ?? null;
const looksYouTube = (url: string) => /(^|\/\/)(www\.|m\.)?(youtube\.com|youtu\.be)\b/i.test(url);
export const detectVideoType = (url: string): "youtube" | "direct" => (youTubeId(url) || looksYouTube(url) ? "youtube" : "direct");

export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** "m:ss" or "h:mm:ss" or plain seconds → seconds, null when invalid. */
export function parseClock(s: string): number | null {
  const t = s.trim();
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, h, mm, ss] = m;
  if (Number(ss) > 59) return null;
  return (h ? Number(h) * 3600 : 0) + Number(mm) * 60 + Number(ss);
}
export const clock = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

export const emptyVideo = (): VideoLesson => ({
  id: uid("vid"),
  title: "",
  type: "youtube",
  url: "",
  duration_seconds: 0,
  instructor_name: "",
  instructor_role: "",
  description: "",
  transcript: [],
});

export function blankModule(tree: AdminTreeSubject[], chapterId?: string | null): LearningModule | null {
  const flat = tree.flatMap((s) => s.chapters.map((c) => ({ s, c })));
  const hit = flat.find((x) => x.c.id === chapterId) ?? flat[0];
  if (!hit) return null;
  return {
    id: "",
    chapter_id: hit.c.id,
    subject_id: hit.s.id,
    stream_id: hit.s.stream_id,
    level_id: hit.s.level_id,
    title: "",
    description: "",
    order: 0,
    difficulty: "Beginner",
    estimated_minutes: 15,
    access_status: hit.c.is_premium ? "premium" : "free",
    resource_access: {},
    referral_unlock: { enabled: false, required_referrals: 2 },
    publish_status: "draft",
    learning_objectives: [],
    reading_markdown: "",
    video_lesson: null,
    document_attachments: [],
    flashcard_deck: [],
    quiz: null,
    resources: [],
  };
}

export function validate(m: LearningModule): Errors {
  const e: Errors = { docs: {}, quiz: {} };
  if (!m.title.trim()) e.title = "Title is required";
  if (!m.chapter_id) e.chapter = "Pick a chapter";
  const v = m.video_lesson;
  if (v) {
    const url = v.url.trim();
    if (!url) e.videoUrl = "Add a video link";
    else if (!isHttpUrl(url)) e.videoUrl = "Enter a full link starting with https://";
    else if (looksYouTube(url) && !youTubeId(url)) e.videoUrl = "Not a valid YouTube link";
    if (!v.title.trim()) e.videoTitle = "Video needs a title";
    const bad = v.transcript.find((t) => parseClock(t.time_str) === null);
    if (bad) e.transcript = "Use mm:ss for every timestamp";
  }
  for (const d of m.document_attachments) {
    if (!d.title.trim()) e.docs[d.id] = "Title is required";
    else if (d.url.trim() && !isHttpUrl(d.url.trim()) && !d.url.startsWith("blob:")) e.docs[d.id] = "Invalid link";
  }
  for (const q of m.quiz?.questions ?? []) {
    const opts = (q.options ?? []).filter((o) => o.trim());
    if (!q.question.trim()) e.quiz[q.id] = "Question text is required";
    else if (opts.length < 2) e.quiz[q.id] = "Needs at least 2 options";
    else if ((q.correct_answers ?? []).length < 1) e.quiz[q.id] = "Mark at least 1 correct answer";
  }
  return e;
}

export function errorTabs(e: Errors): TabId[] {
  const t: TabId[] = [];
  if (e.title || e.chapter) t.push("basics");
  if (e.videoUrl || e.videoTitle || e.transcript) t.push("video");
  if (Object.keys(e.docs).length) t.push("docs");
  if (Object.keys(e.quiz).length) t.push("activities");
  return t;
}

export const hasErrors = (e: Errors) => errorTabs(e).length > 0;

/** Strip server-owned fields and tidy blanks before saving. */
export function toPayload(m: LearningModule): Partial<LearningModule> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = m;
  const quizQs = m.quiz?.questions ?? [];
  return {
    ...rest,
    title: m.title.trim(),
    learning_objectives: m.learning_objectives.map((o) => o.trim()).filter(Boolean),
    video_lesson: m.video_lesson ? { ...m.video_lesson, url: m.video_lesson.url.trim(), type: detectVideoType(m.video_lesson.url), transcript: m.video_lesson.transcript.map((t) => ({ ...t, timestamp_seconds: parseClock(t.time_str) ?? 0 })).sort((a, b) => a.timestamp_seconds - b.timestamp_seconds) } : null,
    document_attachments: m.document_attachments.map((d) => ({ ...d, title: d.title.trim(), slides: d.slides.map((s, i) => ({ ...s, slide_number: i + 1, key_points: s.key_points.map((k) => k.trim()).filter(Boolean) })) })),
    flashcard_deck: m.flashcard_deck.filter((f) => f.question.trim() || f.answer.trim()),
    quiz: m.quiz && quizQs.length ? { ...m.quiz, questions: quizQs.map((q) => ({ ...q, options: q.options?.map((o) => o.trim()) })) } : null,
  };
}

export const RESOURCE_LABEL: Record<ResourceKey, string> = {
  reading: "Reading",
  video: "Video",
  documents: "Documents",
  flashcards: "Flashcards",
  quiz: "Quiz",
  ai_tutor: "AI tutor",
};

export const effectiveAccess = (m: LearningModule, k: ResourceKey): Access => m.resource_access[k] ?? m.access_status;
