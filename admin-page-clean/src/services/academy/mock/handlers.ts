/**
 * Route table of the mock backend. Mirrors how the Go/Gin handlers respond:
 *   200 { <named_envelope>: ... }   201 created   204 no content   4xx { error }
 * Paths are relative to the axios baseURL (`/api`).
 */
import type {
  AdminAnalytics,
  AdminTreeSubject,
  AiDraft,
  AiDraftKind,
  Chapter,
  ChapterOutline,
  DashboardData,
  Difficulty,
  LearningModule,
  ModuleDetailResponse,
  ModuleInput,
  ModuleProgress,
  ModuleSummary,
  QuestionType,
  QuizAttempt,
  SubjectWithProgress,
  TutorMode,
  WeakArea,
} from "@/types/academy";
import {
  chapterOf,
  computeLocks,
  getDB,
  isModuleLocked,
  isReferralUnlocked,
  nid,
  nowISO,
  orderedSubjectModules,
  recomputeProgress,
  resetDB,
  saveDB,
  sortedChaptersOfSubject,
  sortedModulesOfChapter,
  studentModules,
} from "./db";
import {
  generateFlashcardsFromMarkdown,
  generateKeyConcepts,
  generateQuizQuestions,
  generateSummary,
  tutorReply,
} from "./generators";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface MockRequest {
  params: Record<string, string>;
  query: Record<string, string>;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
export interface MockResponse {
  status?: number;
  data?: unknown;
}
type Handler = (req: MockRequest) => MockResponse;

interface Route {
  method: string;
  regex: RegExp;
  keys: string[];
  handler: Handler;
}
const routes: Route[] = [];

function route(method: string, pattern: string, handler: Handler) {
  const keys: string[] = [];
  const src = pattern.replace(/:([a-zA-Z_]+)/g, (_m, k) => {
    keys.push(k);
    return "([^/]+)";
  });
  routes.push({ method, regex: new RegExp(`^${src}/?$`), keys, handler });
}

export function dispatch(method: string, path: string, query: Record<string, string>, body: unknown): MockResponse {
  for (const r of routes) {
    if (r.method !== method.toUpperCase()) continue;
    const m = path.match(r.regex);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    return r.handler({ params, query, body });
  }
  throw new HttpError(404, `no mock route for ${method} ${path}`);
}

const notFound = (what: string): never => {
  throw new HttpError(404, `${what} not found`);
};
const ok = (data: unknown): MockResponse => ({ status: 200, data });

/* ============================= student side ============================= */

function emptyProgress(): ModuleProgress {
  return {
    read_percentage: 0,
    video_time_seconds: 0,
    video_completed: false,
    document_current_page: 1,
    document_completed: false,
    completed: false,
    last_studied_at: nowISO(),
  };
}

function summarize(m: LearningModule): ModuleSummary {
  return {
    id: m.id,
    chapter_id: m.chapter_id,
    title: m.title,
    order: m.order,
    difficulty: m.difficulty,
    estimated_minutes: m.estimated_minutes,
    access_status: m.access_status,
    is_locked: isModuleLocked(m),
    has_video: !!m.video_lesson,
    has_documents: m.document_attachments.length > 0,
    has_flashcards: m.flashcard_deck.length > 0,
    has_quiz: !!m.quiz?.questions.length,
    publish_status: m.publish_status,
  };
}

function subjectWithProgress(subjectId: string): SubjectWithProgress {
  const db = getDB();
  const s = db.subjects.find((x) => x.id === subjectId)!;
  const mods = orderedSubjectModules(s.id);
  const done = mods.filter((m) => db.progress.module_progress[m.id]?.completed).length;
  return {
    ...s,
    chapters_count: sortedChaptersOfSubject(s.id).length,
    total_modules_count: mods.length,
    completed_modules: done,
    progress_percentage: mods.length ? Math.round((done / mods.length) * 100) : 0,
    locked_modules: mods.filter(isModuleLocked).length,
  };
}

function subjectsFor(level?: string, stream?: string): SubjectWithProgress[] {
  const db = getDB();
  return db.subjects
    .filter((s) => (!level || s.level_id === level) && (!stream || stream === "common" || s.stream_id === stream || s.stream_id === "common"))
    .map((s) => subjectWithProgress(s.id));
}

function moduleProgressPct(id: string): number {
  const p = getDB().progress.module_progress[id];
  if (!p) return 0;
  if (p.completed) return 100;
  return Math.round(Math.max(p.read_percentage, p.video_completed ? 100 : 0) * 0.9);
}

function ctxFor(m: LearningModule) {
  const s = getDB().subjects.find((x) => x.id === m.subject_id)!;
  return { subject_id: s.id, subject_name: s.name, subject_color: s.color_theme };
}

route("GET", "/academy/me", () => ok({ student: getDB().student }));

route("PATCH", "/academy/me", ({ body }) => {
  const db = getDB();
  const { level_id, stream_id } = body ?? {};
  if (level_id) db.student.level_id = level_id;
  if (stream_id) db.student.stream_id = stream_id;
  recomputeProgress();
  saveDB();
  return ok({ student: db.student });
});

route("PUT", "/academy/me/target", ({ body }) => {
  const db = getDB();
  const t = Number(body?.target_score);
  if (!Number.isFinite(t) || t < 30 || t > 100) throw new HttpError(400, "target_score must be between 30 and 100");
  db.student.target_score = Math.round(t);
  saveDB();
  return ok({ student: db.student });
});

/** Mock-only: lets reviewers flip between free and premium without a payment flow. */
route("PATCH", "/academy/dev/tier", ({ body }) => {
  const db = getDB();
  db.student.is_premium = !!body?.is_premium;
  saveDB();
  return ok({ student: db.student });
});

route("POST", "/academy/dev/reset", () => {
  resetDB();
  return ok({ message: "success" });
});

route("GET", "/academy/programs", () => {
  const db = getDB();
  const programs = db.programs.map((p) => ({
    ...p,
    subjects_count: db.subjects.filter((s) => s.level_id === p.id).length,
  }));
  return ok({ programs, streams: db.streams });
});

route("GET", "/academy/subjects", ({ query }) => ok({ subjects: subjectsFor(query.level_id, query.stream_id) }));

route("GET", "/academy/subjects/:id", ({ params }) => {
  const db = getDB();
  const s = db.subjects.find((x) => x.id === params.id);
  if (!s) notFound("subject");
  const chapters: ChapterOutline[] = sortedChaptersOfSubject(params.id).map((c) => {
    const mods = sortedModulesOfChapter(c.id).map(summarize);
    const { module_ids: _ids, ...rest } = c;
    void _ids;
    return { ...rest, is_locked: mods.length > 0 && mods.every((m) => m.is_locked), modules: mods };
  });
  const mp = db.progress.module_progress;
  return ok({
    subject: subjectWithProgress(params.id),
    chapters,
    progress: {
      completed_ids: Object.keys(mp).filter((k) => mp[k].completed),
      started_ids: Object.keys(mp).filter((k) => !mp[k].completed),
    },
  });
});

route("GET", "/academy/modules/:id", ({ params }) => {
  const db = getDB();
  const raw = db.modules.find((m) => m.id === params.id && m.publish_status === "published");
  if (!raw) notFound("module");
  const m = raw as LearningModule;
  const chapter = chapterOf(m)!;
  const subject = db.subjects.find((s) => s.id === m.subject_id)!;
  const locks = computeLocks(m);
  const flat = orderedSubjectModules(m.subject_id);
  const idx = flat.findIndex((x) => x.id === m.id);
  const nb = (x?: LearningModule) => (x ? { id: x.id, title: x.title, is_locked: isModuleLocked(x) } : null);

  // Strip protected payloads server-side (premium content protection).
  const out: LearningModule = JSON.parse(JSON.stringify(m));
  if (locks.reading) {
    const teaser = m.reading_markdown.replace(/^#.*$/gm, "").replace(/:::[a-z-]*/g, "").trim().split("\n").find((l) => l.trim().length > 40) ?? "";
    out.reading_markdown = teaser.slice(0, 220);
  }
  if (locks.video && out.video_lesson) out.video_lesson = { ...out.video_lesson, url: "", transcript: [], description: "" };
  if (locks.documents) out.document_attachments = out.document_attachments.map((d) => ({ ...d, url: "", slides: [] }));
  if (locks.flashcards) out.flashcard_deck = [];
  if (locks.quiz && out.quiz) out.quiz = { ...out.quiz, questions: [] };

  const res: ModuleDetailResponse = {
    module: out,
    locks,
    fully_locked: Object.values(locks).every(Boolean),
    progress: db.progress.module_progress[m.id] ?? null,
    flashcard_progress: db.progress.flashcard_progress[m.id] ?? null,
    subject: { id: subject.id, name: subject.name, color_theme: subject.color_theme, icon_name: subject.icon_name, level_id: subject.level_id, stream_id: subject.stream_id },
    chapter: { id: chapter.id, title: chapter.title, order_number: chapter.order_number },
    prev: nb(flat[idx - 1]),
    next: nb(flat[idx + 1]),
    referral: {
      enabled: !!m.referral_unlock?.enabled,
      required: m.referral_unlock?.required_referrals ?? 2,
      current: db.referrals[m.id] ?? 0,
      unlocked: isReferralUnlocked(m),
    },
    counts: {
      flashcards: m.flashcard_deck.length,
      quiz_questions: m.quiz?.questions.length ?? 0,
      documents: m.document_attachments.length,
      has_video: !!m.video_lesson,
    },
  };
  return ok(res);
});

route("POST", "/academy/modules/:id/progress", ({ params, body }) => {
  const db = getDB();
  const m = db.modules.find((x) => x.id === params.id);
  if (!m) notFound("module");
  const cur = db.progress.module_progress[params.id] ?? emptyProgress();
  const b = body ?? {};
  const next: ModuleProgress = {
    ...cur,
    read_percentage: b.read_percentage != null ? Math.max(cur.read_percentage, Math.min(100, Math.round(b.read_percentage))) : cur.read_percentage,
    video_time_seconds: b.video_time_seconds ?? cur.video_time_seconds,
    video_completed: cur.video_completed || !!b.video_completed,
    document_current_page: b.document_current_page ?? cur.document_current_page,
    document_completed: cur.document_completed || !!b.document_completed,
    last_studied_at: nowISO(),
  };
  db.progress.module_progress[params.id] = next;
  db.progress.recent_module_id = params.id;
  saveDB();
  return ok({ progress: next });
});

route("POST", "/academy/modules/:id/complete", ({ params, body }) => {
  const db = getDB();
  const m = db.modules.find((x) => x.id === params.id);
  if (!m) notFound("module");
  if (isModuleLocked(m as LearningModule)) throw new HttpError(403, "premium content");
  const cur = db.progress.module_progress[params.id] ?? emptyProgress();
  const completed = body?.completed !== false;
  const wasDone = cur.completed;
  db.progress.module_progress[params.id] = {
    ...cur,
    completed,
    read_percentage: completed ? 100 : cur.read_percentage,
    last_studied_at: nowISO(),
  };
  if (completed && !wasDone) {
    db.progress.total_minutes_studied += (m as LearningModule).estimated_minutes;
    db.progress.study_streak_days = Math.max(db.progress.study_streak_days, 1);
  }
  db.progress.recent_module_id = params.id;
  recomputeProgress();
  saveDB();
  return ok({ progress: db.progress.module_progress[params.id], overall_completion: db.progress.overall_completion_percentage });
});

/** Mock of "a friend opened my referral link". The real backend counts unique visits. */
route("POST", "/academy/modules/:id/referral", ({ params }) => {
  const db = getDB();
  const m = db.modules.find((x) => x.id === params.id);
  if (!m) notFound("module");
  const mod = m as LearningModule;
  if (!mod.referral_unlock?.enabled) throw new HttpError(400, "referral unlock is not enabled for this content");
  db.referrals[params.id] = Math.min((db.referrals[params.id] ?? 0) + 1, mod.referral_unlock.required_referrals);
  db.student.referral_count += 1;
  saveDB();
  return ok({
    referral: {
      enabled: true,
      required: mod.referral_unlock.required_referrals,
      current: db.referrals[params.id],
      unlocked: isReferralUnlocked(mod),
    },
  });
});

route("POST", "/academy/flashcard-reviews", ({ body }) => {
  const db = getDB();
  const { module_id, mastered_ids = [], struggling_ids = [] } = body ?? {};
  if (!module_id) throw new HttpError(400, "module_id is required");
  const total = mastered_ids.length + struggling_ids.length;
  const fp = {
    deck_module_id: module_id,
    mastered_ids,
    struggling_ids,
    last_reviewed_at: nowISO(),
    recall_rate: total ? Math.round((mastered_ids.length / total) * 100) : 0,
  };
  db.progress.flashcard_progress[module_id] = fp;
  saveDB();
  return ok({ flashcard_progress: fp });
});

route("POST", "/academy/quiz-attempts", ({ body }) => {
  const db = getDB();
  const { module_id, quiz_id, score, total_questions, weak_topics = [], source = "module", passing = 60 } = body ?? {};
  if (!module_id || total_questions == null) throw new HttpError(400, "module_id and total_questions are required");
  const pct = total_questions ? Math.round((score / total_questions) * 100) : 0;
  const attempt: QuizAttempt = {
    id: nid("qa"),
    module_id,
    quiz_id: quiz_id ?? "ai",
    score,
    total_questions,
    percentage: pct,
    passed: pct >= passing,
    completed_at: nowISO(),
    weak_topics,
    source,
  };
  db.progress.quiz_attempts.unshift(attempt);
  db.progress.quiz_attempts = db.progress.quiz_attempts.slice(0, 50);
  saveDB();
  return { status: 201, data: { attempt } };
});

route("GET", "/academy/quiz-attempts", ({ query }) => {
  const list = getDB().progress.quiz_attempts.filter((a) => !query.module_id || a.module_id === query.module_id);
  return ok({ attempts: list });
});

route("GET", "/academy/dashboard", () => {
  const db = getDB();
  const st = db.student;
  const subjects = subjectsFor(st.level_id, st.stream_id);
  const mods = subjects.flatMap((s) => orderedSubjectModules(s.id));
  const done = mods.filter((m) => db.progress.module_progress[m.id]?.completed).length;

  // continue: most recent unfinished
  const recent = Object.entries(db.progress.module_progress)
    .filter(([id, p]) => !p.completed && mods.some((m) => m.id === id))
    .sort((a, b) => b[1].last_studied_at.localeCompare(a[1].last_studied_at))[0];
  const contModule = recent ? mods.find((m) => m.id === recent[0]) : mods.find((m) => !db.progress.module_progress[m.id]?.completed && !isModuleLocked(m));

  // recommended: weakest topic's module, else next unstarted free module
  const attempts = db.progress.quiz_attempts;
  const weakAttempt = attempts.find((a) => a.weak_topics.length && mods.some((m) => m.id === a.module_id));
  let rec: LearningModule | undefined;
  let reason = "Next up in your plan";
  if (weakAttempt) {
    rec = mods.find((m) => m.id === weakAttempt.module_id);
    reason = `Strengthen “${weakAttempt.weak_topics[0]}”`;
  }
  if (!rec || rec.id === contModule?.id) {
    rec = mods.find((m) => !db.progress.module_progress[m.id] && m.id !== contModule?.id && !isModuleLocked(m));
    reason = "New topic you haven't started";
  }

  const weak: WeakArea[] = [];
  for (const a of attempts) {
    const mod = db.modules.find((m) => m.id === a.module_id);
    if (!mod) continue;
    const subj = db.subjects.find((s) => s.id === mod.subject_id);
    for (const t of a.weak_topics) {
      if (weak.some((w) => w.topic === t)) continue;
      weak.push({ topic: t, subject_id: mod.subject_id, subject_name: subj?.name ?? "", error_rate: Math.round(100 - a.percentage), module_id: mod.id });
    }
  }

  const struggling = Object.values(db.progress.flashcard_progress).reduce((n, f) => n + f.struggling_ids.length, 0);
  const startedWithoutReview = Object.keys(db.progress.module_progress).filter((id) => !db.progress.flashcard_progress[id] && db.modules.find((m) => m.id === id)?.flashcard_deck.length).length;

  const streak = db.progress.study_streak_days;
  const todayIdx = (new Date().getDay() + 6) % 7;
  const week = Array.from({ length: 7 }, (_, i) => i <= todayIdx && todayIdx - i < streak);

  const avgAttempts = attempts.slice(0, 5);
  const current_average = avgAttempts.length ? Math.round(avgAttempts.reduce((n, a) => n + a.percentage, 0) / avgAttempts.length) : 0;

  const data: DashboardData = {
    student: st,
    streak_days: streak,
    week_activity: week,
    total_minutes_studied: db.progress.total_minutes_studied,
    overall_completion: mods.length ? Math.round((done / mods.length) * 100) : 0,
    completed_modules: done,
    total_modules: mods.length,
    continue_module: contModule ? { ...summarize(contModule), ...ctxFor(contModule), progress: moduleProgressPct(contModule.id) } : null,
    recommended_module: rec ? { ...summarize(rec), ...ctxFor(rec), reason } : null,
    subjects,
    flashcards_due: struggling + startedWithoutReview * 3,
    weak_areas: weak.slice(0, 5),
    recent_quiz_attempts: attempts.slice(0, 5),
    target: { target_score: st.target_score, current_average },
    notice: db.notice,
  };
  return ok({ dashboard: data });
});

/* -------------------------------- AI -------------------------------- */

function requireModule(id: string): LearningModule {
  const m = getDB().modules.find((x) => x.id === id);
  if (!m) throw new HttpError(404, "module not found");
  return m;
}

route("POST", "/academy/ai/flashcards", ({ body }) => {
  const m = requireModule(body?.module_id);
  if (computeLocks(m).ai_tutor && computeLocks(m).flashcards) throw new HttpError(403, "premium feature");
  const count = Math.min(Math.max(Number(body?.count) || 6, 1), 12);
  const cards = generateFlashcardsFromMarkdown(m, count, (body?.difficulty as Difficulty | "Mixed") ?? "Mixed", Date.now() % 997);
  return ok({ flashcards: cards });
});

route("POST", "/academy/ai/quiz", ({ body }) => {
  const m = requireModule(body?.module_id);
  const count = Math.min(Math.max(Number(body?.count) || 5, 1), 15);
  const types = (body?.types as QuestionType[] | undefined)?.length ? (body.types as QuestionType[]) : (["multiple_choice", "true_false"] as QuestionType[]);
  const questions = generateQuizQuestions(m, count, (body?.difficulty as Difficulty | "Mixed") ?? "Mixed", types, 1 + (Date.now() % 997));
  return ok({
    quiz: {
      id: nid("ai-quiz"),
      title: `AI quiz — ${m.title}`,
      duration_minutes: Math.max(3, Math.round(count * 1.2)),
      passing_score_percentage: 60,
      questions,
    },
  });
});

route("POST", "/academy/ai/tutor", ({ body }) => {
  const m = requireModule(body?.module_id);
  if (computeLocks(m).ai_tutor) throw new HttpError(403, "premium feature");
  const reply = tutorReply(m, String(body?.message ?? ""), (body?.mode as TutorMode) ?? "chat", body?.selection);
  return ok({ reply });
});

/* ============================== admin side ============================== */

function adminModuleRow(m: LearningModule) {
  return {
    id: m.id,
    title: m.title,
    order: m.order,
    access_status: m.access_status,
    publish_status: m.publish_status,
    difficulty: m.difficulty,
    estimated_minutes: m.estimated_minutes,
    has_video: !!m.video_lesson,
    flashcards: m.flashcard_deck.length,
    questions: m.quiz?.questions.length ?? 0,
    documents: m.document_attachments.length,
  };
}

route("GET", "/academy/admin/tree", ({ query }) => {
  const db = getDB();
  const tree: AdminTreeSubject[] = db.subjects
    .filter((s) => (!query.level_id || s.level_id === query.level_id) && (!query.stream_id || query.stream_id === "all" || s.stream_id === query.stream_id))
    .map((s) => ({
      ...s,
      chapters: sortedChaptersOfSubject(s.id).map((c) => ({ ...c, modules: sortedModulesOfChapter(c.id, true).map(adminModuleRow) })),
    }));
  return ok({ tree, programs: db.programs, streams: db.streams });
});

route("GET", "/academy/admin/modules/:id", ({ params }) => {
  const m = requireModule(params.id);
  return ok({ module: m, chapter: chapterOf(m), subject: getDB().subjects.find((s) => s.id === m.subject_id) });
});

route("POST", "/academy/admin/modules", ({ body }) => {
  const db = getDB();
  const input = body as ModuleInput;
  if (!input?.title?.trim()) throw new HttpError(400, "title is required");
  const chapter = db.chapters.find((c) => c.id === input.chapter_id);
  if (!chapter) throw new HttpError(400, "chapter_id is invalid");
  const subject = db.subjects.find((s) => s.id === chapter.subject_id)!;
  const siblings = sortedModulesOfChapter(chapter.id, true);
  const m: LearningModule = {
    id: nid("mod"),
    chapter_id: chapter.id,
    subject_id: subject.id,
    stream_id: subject.stream_id,
    level_id: subject.level_id,
    title: input.title.trim(),
    description: input.description ?? "",
    order: (siblings[siblings.length - 1]?.order ?? 0) + 1,
    difficulty: input.difficulty ?? "Beginner",
    estimated_minutes: input.estimated_minutes ?? 15,
    access_status: input.access_status ?? (chapter.is_premium ? "premium" : "free"),
    resource_access: input.resource_access ?? {},
    referral_unlock: input.referral_unlock ?? { enabled: false, required_referrals: 2 },
    publish_status: input.publish_status ?? "draft",
    learning_objectives: input.learning_objectives ?? [],
    reading_markdown: input.reading_markdown ?? `# ${input.title.trim()}\n\nStart writing…`,
    video_lesson: input.video_lesson ?? null,
    document_attachments: input.document_attachments ?? [],
    flashcard_deck: input.flashcard_deck ?? [],
    quiz: input.quiz ?? null,
    resources: input.resources ?? [],
    created_at: nowISO(),
    updated_at: nowISO(),
  };
  db.modules.push(m);
  chapter.module_ids.push(m.id);
  refreshCounts();
  saveDB();
  return { status: 201, data: { module: m } };
});

route("PUT", "/academy/admin/modules/:id", ({ params, body }) => {
  const db = getDB();
  const idx = db.modules.findIndex((m) => m.id === params.id);
  if (idx < 0) notFound("module");
  const input = body as Partial<LearningModule>;
  if (input.title !== undefined && !input.title.trim()) throw new HttpError(400, "title is required");
  const merged = { ...db.modules[idx], ...input, id: params.id, updated_at: nowISO() } as LearningModule;
  // moving chapter keeps denormalised ids consistent
  if (input.chapter_id && input.chapter_id !== db.modules[idx].chapter_id) {
    const from = db.chapters.find((c) => c.id === db.modules[idx].chapter_id);
    const to = db.chapters.find((c) => c.id === input.chapter_id);
    if (!to) throw new HttpError(400, "chapter_id is invalid");
    if (from) from.module_ids = from.module_ids.filter((x) => x !== params.id);
    to.module_ids.push(params.id);
    merged.subject_id = to.subject_id;
  }
  db.modules[idx] = merged;
  refreshCounts();
  saveDB();
  return ok({ module: merged });
});

route("DELETE", "/academy/admin/modules/:id", ({ params }) => {
  const db = getDB();
  const m = db.modules.find((x) => x.id === params.id);
  if (!m) notFound("module");
  db.modules = db.modules.filter((x) => x.id !== params.id);
  db.chapters.forEach((c) => (c.module_ids = c.module_ids.filter((id) => id !== params.id)));
  db.drafts = db.drafts.filter((d) => d.module_id !== params.id);
  refreshCounts();
  saveDB();
  return { status: 204 };
});

route("POST", "/academy/admin/modules/:id/duplicate", ({ params }) => {
  const db = getDB();
  const m = requireModule(params.id);
  const copy: LearningModule = JSON.parse(JSON.stringify(m));
  copy.id = nid("mod");
  copy.title = `${m.title} (copy)`;
  copy.publish_status = "draft";
  copy.order = (lastOrder(m.chapter_id)) + 1;
  copy.created_at = copy.updated_at = nowISO();
  db.modules.push(copy);
  chapterOf(m)?.module_ids.push(copy.id);
  refreshCounts();
  saveDB();
  return { status: 201, data: { module: copy } };
});

route("PATCH", "/academy/admin/modules/:id/access", ({ params, body }) => {
  const m = requireModule(params.id);
  if (body?.access_status) m.access_status = body.access_status;
  if (body?.resource_access) m.resource_access = body.resource_access;
  if (body?.referral_unlock) m.referral_unlock = body.referral_unlock;
  m.updated_at = nowISO();
  saveDB();
  return ok({ module: m });
});

route("PATCH", "/academy/admin/modules/:id/status", ({ params, body }) => {
  const m = requireModule(params.id);
  if (!["published", "draft", "scheduled", "archived"].includes(body?.publish_status)) throw new HttpError(400, "invalid publish_status");
  m.publish_status = body.publish_status;
  m.updated_at = nowISO();
  saveDB();
  return ok({ module: m });
});

route("POST", "/academy/admin/modules/:id/reorder", ({ params, body }) => {
  const m = requireModule(params.id);
  const sibs = sortedModulesOfChapter(m.chapter_id, true);
  const i = sibs.findIndex((x) => x.id === m.id);
  const j = body?.direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= sibs.length) return ok({ message: "success" });
  [sibs[i].order, sibs[j].order] = [sibs[j].order, sibs[i].order];
  if (sibs[i].order === sibs[j].order) sibs[j].order += 1;
  saveDB();
  return ok({ message: "success" });
});

/* chapters */
route("POST", "/academy/admin/chapters", ({ body }) => {
  const db = getDB();
  if (!body?.title?.trim()) throw new HttpError(400, "title is required");
  if (!db.subjects.some((s) => s.id === body.subject_id)) throw new HttpError(400, "subject_id is invalid");
  const c: Chapter = {
    id: nid("chap"),
    subject_id: body.subject_id,
    title: body.title.trim(),
    order_number: sortedChaptersOfSubject(body.subject_id).length + 1,
    description: body.description ?? "",
    is_premium: !!body.is_premium,
    module_ids: [],
  };
  db.chapters.push(c);
  refreshCounts();
  saveDB();
  return { status: 201, data: { chapter: c } };
});

route("PUT", "/academy/admin/chapters/:id", ({ params, body }) => {
  const c = getDB().chapters.find((x) => x.id === params.id);
  if (!c) notFound("chapter");
  Object.assign(c as Chapter, { title: body?.title ?? (c as Chapter).title, description: body?.description ?? (c as Chapter).description, is_premium: body?.is_premium ?? (c as Chapter).is_premium });
  saveDB();
  return ok({ chapter: c });
});

route("DELETE", "/academy/admin/chapters/:id", ({ params }) => {
  const db = getDB();
  db.chapters = db.chapters.filter((c) => c.id !== params.id);
  db.modules = db.modules.filter((m) => m.chapter_id !== params.id);
  refreshCounts();
  saveDB();
  return { status: 204 };
});

route("POST", "/academy/admin/chapters/:id/reorder", ({ params, body }) => {
  const c = getDB().chapters.find((x) => x.id === params.id);
  if (!c) notFound("chapter");
  const sibs = sortedChaptersOfSubject((c as Chapter).subject_id);
  const i = sibs.findIndex((x) => x.id === params.id);
  const j = body?.direction === "up" ? i - 1 : i + 1;
  if (j >= 0 && j < sibs.length) [sibs[i].order_number, sibs[j].order_number] = [sibs[j].order_number, sibs[i].order_number];
  saveDB();
  return ok({ message: "success" });
});

/* subjects / programs */
route("POST", "/academy/admin/subjects", ({ body }) => {
  const db = getDB();
  if (!body?.name?.trim()) throw new HttpError(400, "name is required");
  const s = {
    id: nid("sub"),
    name: body.name.trim(),
    code: body.code ?? body.name.slice(0, 4).toUpperCase(),
    level_id: body.level_id ?? "grade-12",
    stream_id: body.stream_id ?? "common",
    description: body.description ?? "",
    icon_name: body.icon_name ?? "BookOpen",
    color_theme: body.color_theme ?? "blue",
    chapters_count: 0,
    total_modules_count: 0,
  };
  db.subjects.push(s);
  saveDB();
  return { status: 201, data: { subject: s } };
});

route("PATCH", "/academy/admin/programs/:id", ({ params, body }) => {
  const p = getDB().programs.find((x) => x.id === params.id);
  if (!p) notFound("program");
  if (typeof body?.is_active === "boolean") (p as { is_active: boolean }).is_active = body.is_active;
  saveDB();
  return ok({ program: p });
});

function lastOrder(chapterId: string) {
  const l = sortedModulesOfChapter(chapterId, true);
  return l[l.length - 1]?.order ?? 0;
}

function refreshCounts() {
  const db = getDB();
  for (const s of db.subjects) {
    s.chapters_count = db.chapters.filter((c) => c.subject_id === s.id).length;
    s.total_modules_count = db.modules.filter((m) => m.subject_id === s.id).length;
  }
  recomputeProgress();
}

/* AI drafts (review → edit → approve → publish) */
route("POST", "/academy/admin/ai/generate", ({ body }) => {
  const db = getDB();
  const m = requireModule(body?.module_id);
  const kinds: AiDraftKind[] = body?.kinds?.length ? body.kinds : ["flashcards", "quiz"];
  const count = Math.min(Math.max(Number(body?.count) || 6, 1), 15);
  const diff = (body?.difficulty as Difficulty | "Mixed") ?? "Mixed";
  const source = (body?.source as AiDraft["source"]) ?? "markdown";
  const made: AiDraft[] = kinds.map((kind) => {
    const base: AiDraft = { id: nid("draft"), module_id: m.id, kind, status: "pending", source, created_at: nowISO() };
    if (kind === "flashcards") base.flashcards = generateFlashcardsFromMarkdown(m, count, diff, 1 + (Date.now() % 997));
    if (kind === "quiz") base.questions = generateQuizQuestions(m, count, diff, ["multiple_choice", "true_false", "scenario"], 1 + (Date.now() % 997));
    if (kind === "summary") base.text = generateSummary(m);
    if (kind === "key_concepts") base.items = generateKeyConcepts(m);
    return base;
  });
  db.drafts.unshift(...made);
  saveDB();
  return { status: 201, data: { drafts: made } };
});

route("GET", "/academy/admin/ai-drafts", ({ query }) => {
  const list = getDB().drafts.filter((d) => !query.module_id || d.module_id === query.module_id);
  return ok({ drafts: list });
});

route("PATCH", "/academy/admin/ai-drafts/:id", ({ params, body }) => {
  const db = getDB();
  const d = db.drafts.find((x) => x.id === params.id);
  if (!d) notFound("draft");
  const draft = d as AiDraft;
  if (body?.flashcards) draft.flashcards = body.flashcards;
  if (body?.questions) draft.questions = body.questions;
  if (body?.text !== undefined) draft.text = body.text;
  if (body?.items) draft.items = body.items;
  if (body?.status) {
    draft.status = body.status;
    if (body.status === "approved") {
      const m = requireModule(draft.module_id);
      if (draft.kind === "flashcards" && draft.flashcards) m.flashcard_deck = [...m.flashcard_deck, ...draft.flashcards];
      if (draft.kind === "quiz" && draft.questions) {
        m.quiz = m.quiz
          ? { ...m.quiz, questions: [...m.quiz.questions, ...draft.questions] }
          : { id: nid("quiz"), title: `${m.title} — Check`, duration_minutes: 10, passing_score_percentage: 60, questions: draft.questions };
      }
      if (draft.kind === "summary" && draft.text) m.description = draft.text.replace(/\*\*/g, "").slice(0, 280);
      m.updated_at = nowISO();
    }
  }
  saveDB();
  return ok({ draft });
});

route("DELETE", "/academy/admin/ai-drafts/:id", ({ params }) => {
  const db = getDB();
  db.drafts = db.drafts.filter((d) => d.id !== params.id);
  saveDB();
  return { status: 204 };
});

route("GET", "/academy/admin/analytics", () => {
  const db = getDB();
  const mods = studentModules();
  const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rows = db.modules.map((m) => {
    const h = hash(m.id);
    const subject = db.subjects.find((s) => s.id === m.subject_id);
    return {
      id: m.id,
      title: m.title,
      subject_name: subject?.name ?? "",
      views: 400 + (h % 2900),
      completion_rate: 40 + (h % 48),
      avg_minutes: Math.max(8, Math.round(m.estimated_minutes * (0.7 + (h % 40) / 100))),
      video_completion: 35 + ((h >> 3) % 55),
      flashcard_recall: 45 + ((h >> 5) % 45),
      quiz_avg: 40 + ((h >> 7) % 50),
      abandon_rate: 8 + ((h >> 2) % 35),
      access_status: m.access_status,
    };
  });
  const data: AdminAnalytics = {
    total_enrollments: 4850,
    free_to_premium_rate: 23.4,
    total_modules: db.modules.length,
    published_modules: mods.length,
    premium_modules: db.modules.filter((m) => m.access_status === "premium").length,
    modules: rows,
    weakest_topics: [
      { topic: "Infinite series convergence (|r| < 1)", subject: "Mathematics", error_rate: 46, students_affected: 620 },
      { topic: "PV cycle work area", subject: "Physics", error_rate: 39, students_affected: 480 },
      { topic: "Transfer payments & GDP", subject: "Economics", error_rate: 34, students_affected: 310 },
      { topic: "Inserting k arithmetic means", subject: "Mathematics", error_rate: 28, students_affected: 290 },
      { topic: "Le Chatelier shifts", subject: "Chemistry", error_rate: 26, students_affected: 240 },
    ],
    engagement_by_level: [
      { level: "Grade 9", students: 640, completion: 48 },
      { level: "Grade 10", students: 820, completion: 52 },
      { level: "Grade 11", students: 910, completion: 57 },
      { level: "Grade 12", students: 1620, completion: 63 },
      { level: "Remedial", students: 520, completion: 55 },
      { level: "Exit Exam", students: 340, completion: 44 },
    ],
    engagement_by_stream: [
      { stream: "Natural", students: 2410, completion: 61 },
      { stream: "Social", students: 1830, completion: 54 },
      { stream: "Common", students: 610, completion: 50 },
    ],
    weekly_active: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => ({
      day,
      free: 520 + ((i * 97) % 240),
      premium: 310 + ((i * 61) % 170),
    })),
  };
  return ok({ analytics: data });
});
