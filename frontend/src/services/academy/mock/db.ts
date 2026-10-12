/**
 * In-memory "database" for the mock API. Persisted to localStorage so admin
 * edits are visible on the student side after navigation/reload.
 *
 * Nothing outside src/services/academy/mock should import this file — the UI
 * only talks to the HTTP-shaped API in ../academyApi.ts.
 */
import type {
  AcademyStudent,
  AiDraft,
  Chapter,
  LearningModule,
  Program,
  ResourceKey,
  ResourceLocks,
  Stream,
  StudentProgress,
  Subject,
} from "@/types/academy";
import { RESOURCE_KEYS } from "@/types/academy";
import {
  SEED_CHAPTERS,
  SEED_MODULES,
  SEED_PROGRAMS,
  SEED_PROGRESS,
  SEED_STREAMS,
  SEED_SUBJECTS,
} from "./seed";
import { buildChapter, buildModule, EXPANSION, EXTRA_MODULES_FOR_EXISTING } from "./expansion";
import { generateFlashcardsFromMarkdown, generateQuizQuestions } from "./generators";

const STORAGE_KEY = "victory_academy_mock_v2";
const VERSION = 2;

export interface MockDB {
  version: number;
  programs: Program[];
  streams: Stream[];
  subjects: Subject[];
  chapters: Chapter[];
  modules: LearningModule[];
  progress: StudentProgress;
  student: AcademyStudent;
  drafts: AiDraft[];
  referrals: Record<string, number>;
  notice: { id: string; text: string; tone: "info" | "success" | "warning" } | null;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function buildInitial(): MockDB {
  const subjects = clone(SEED_SUBJECTS);
  const chapters = clone(SEED_CHAPTERS);
  const modules = clone(SEED_MODULES);

  // 1) missing modules for chapters that already existed in the seed
  for (const [chapterId, rows] of Object.entries(EXTRA_MODULES_FOR_EXISTING)) {
    const chapter = chapters.find((c) => c.id === chapterId);
    if (!chapter) continue;
    const subject = subjects.find((s) => s.id === chapter.subject_id)!;
    rows.forEach((row, i) => {
      if (modules.some((m) => m.id === row.id)) return;
      modules.push(buildModule(row, { subject, chapter: { id: chapter.id, premium: chapter.is_premium }, order: 10 + i }, modules.length));
    });
  }

  // 2) brand-new chapters/modules so every subject has a real course
  for (const block of EXPANSION) {
    const subject = subjects.find((s) => s.id === block.subject_id);
    if (!subject) continue;
    const existing = chapters.filter((c) => c.subject_id === subject.id).length;
    block.chapters.forEach((c, ci) => {
      if (chapters.some((x) => x.id === c.id)) return;
      chapters.push(buildChapter(c, subject.id, existing + ci + 1));
      c.modules.forEach((row, mi) => {
        modules.push(buildModule(row, { subject, chapter: c, order: mi + 1 }, modules.length));
      });
    });
  }

  // 3) give seed modules without a deck/quiz one so every tab has content
  for (const m of modules) {
    if (!m.flashcard_deck.length) m.flashcard_deck = generateFlashcardsFromMarkdown(m, 4, "Mixed");
    if (!m.quiz) {
      m.quiz = {
        id: `quiz-${m.id}`,
        title: `${m.title} — Check`,
        duration_minutes: 8,
        passing_score_percentage: 60,
        questions: generateQuizQuestions(m, 5, "Mixed", ["multiple_choice", "true_false", "multiple_choice", "scenario", "multiple_choice"]),
      };
    }
  }

  // 4) demo per-resource locks + referral so the lock UI is visible out of the box
  const patch = (id: string, fn: (m: LearningModule) => void) => {
    const m = modules.find((x) => x.id === id);
    if (m) fn(m);
  };
  patch("mod-math-102", (m) => (m.resource_access = { quiz: "premium", ai_tutor: "premium" }));
  patch("mod-phys-101", (m) => (m.resource_access = { flashcards: "premium" }));
  patch("mod-econ-101", (m) => (m.resource_access = { documents: "premium" }));
  patch("mod-math-103", (m) => (m.referral_unlock = { enabled: true, required_referrals: 2 }));
  patch("mod-chem-201", (m) => (m.referral_unlock = { enabled: true, required_referrals: 2 }));

  // 5) a draft + a scheduled module so admin states are populated
  patch("mod-bio-201", (m) => (m.publish_status = "draft"));
  patch("mod-cs-201", (m) => (m.publish_status = "scheduled"));

  // keep denormalised counters honest
  for (const s of subjects) {
    const cs = chapters.filter((c) => c.subject_id === s.id);
    s.chapters_count = cs.length;
    s.total_modules_count = modules.filter((m) => m.subject_id === s.id).length;
  }

  const progress = clone(SEED_PROGRESS);
  progress.recent_module_id = "mod-math-102";

  return {
    version: VERSION,
    programs: clone(SEED_PROGRAMS),
    streams: clone(SEED_STREAMS),
    subjects,
    chapters,
    modules,
    progress,
    student: {
      id: "stu-1001",
      full_name: "Hana Tesfaye",
      first_name: "Hana",
      grade: "12",
      level_id: "grade-12",
      stream_id: "natural-science",
      is_premium: false,
      referral_count: 0,
      target_score: 85,
    },
    drafts: [],
    referrals: {},
    notice: {
      id: "n1",
      text: "Mock exam week starts Monday — finish Chapter 1 to stay on track.",
      tone: "info",
    },
  };
}

function load(): MockDB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockDB;
      if (parsed.version === VERSION) return parsed;
    }
  } catch {
    /* storage blocked / corrupt → rebuild */
  }
  return buildInitial();
}

let db: MockDB = load();

export function getDB(): MockDB {
  return db;
}

export function saveDB(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* ignore quota / private mode */
  }
}

export function resetDB(): void {
  db = buildInitial();
  saveDB();
}

/* ------------------------------ helpers ------------------------------ */

export const nowISO = () => new Date().toISOString();
export const nid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function chapterOf(mod: LearningModule): Chapter | undefined {
  return db.chapters.find((c) => c.id === mod.chapter_id);
}

export function isReferralUnlocked(mod: LearningModule): boolean {
  if (!mod.referral_unlock?.enabled) return false;
  return (db.referrals[mod.id] ?? 0) >= mod.referral_unlock.required_referrals;
}

/** Effective access for a resource: explicit override → module (or its chapter). */
export function resourceAccess(mod: LearningModule, key: ResourceKey) {
  const chapter = chapterOf(mod);
  const base = chapter?.is_premium ? "premium" : mod.access_status;
  return mod.resource_access?.[key] ?? base;
}

export function computeLocks(mod: LearningModule): ResourceLocks {
  const premium = db.student.is_premium;
  const unlocked = isReferralUnlocked(mod);
  const locks = {} as ResourceLocks;
  for (const k of RESOURCE_KEYS) {
    locks[k] = !premium && !unlocked && resourceAccess(mod, k) === "premium";
  }
  return locks;
}

/** A module counts as locked in outlines when its main (reading) content is locked. */
export function isModuleLocked(mod: LearningModule): boolean {
  return computeLocks(mod).reading;
}

export function studentModules(): LearningModule[] {
  return db.modules.filter((m) => m.publish_status === "published");
}

export function sortedModulesOfChapter(chapterId: string, includeUnpublished = false): LearningModule[] {
  return db.modules
    .filter((m) => m.chapter_id === chapterId && (includeUnpublished || m.publish_status === "published"))
    .sort((a, b) => a.order - b.order);
}

export function sortedChaptersOfSubject(subjectId: string): Chapter[] {
  return db.chapters.filter((c) => c.subject_id === subjectId).sort((a, b) => a.order_number - b.order_number);
}

/** Flat ordered list of a subject's published modules (for prev/next). */
export function orderedSubjectModules(subjectId: string): LearningModule[] {
  return sortedChaptersOfSubject(subjectId).flatMap((c) => sortedModulesOfChapter(c.id));
}

export function recomputeProgress(): void {
  const p = db.progress;
  const mods = studentModules().filter(
    (m) => m.level_id === db.student.level_id && (m.stream_id === db.student.stream_id || m.stream_id === "common"),
  );
  const done = mods.filter((m) => p.module_progress[m.id]?.completed).length;
  p.completed_module_ids = db.modules.filter((m) => p.module_progress[m.id]?.completed).map((m) => m.id);
  p.overall_completion_percentage = mods.length ? Math.round((done / mods.length) * 100) : 0;
}
