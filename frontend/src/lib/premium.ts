import { BookOpen, Bot, Layers, PenLine, Trophy, Video, type LucideIcon } from "lucide-react";
import type { ResourceKey } from "@/types/academy";

/**
 * One vocabulary for "this is Premium" across the whole app: the Academy keys come
 * straight from the API's `resource_access` map, the rest are the contest-side
 * features the student can be blocked from. `plan` is the general pitch.
 */
export type PremiumSubject =
  | ResourceKey
  | "plan"
  | "ai_practice"
  | "ai_recommendations"
  | "premium_contest";

export interface PremiumPitch {
  /** Sheet headline - says exactly what is locked. */
  title: string;
  /** One line under the headline: what Premium gives for this thing. */
  blurb: string;
}

export const PREMIUM_PITCH: Record<PremiumSubject, PremiumPitch> = {
  plan: {
    title: "Unlock the whole Academy",
    blurb: "Every lesson, video, deck and quiz in the Academy, plus the AI tutor.",
  },
  reading: {
    title: "This lesson is Premium",
    blurb: "The full explanation, worked examples and derivations are for Premium members.",
  },
  video: {
    title: "Video lessons are Premium",
    blurb: "The recorded lesson for this topic is part of Premium.",
  },
  documents: {
    title: "Documents are Premium",
    blurb: "Slide decks and written notes for this lesson are part of Premium.",
  },
  flashcards: {
    title: "Flashcards are Premium",
    blurb: "This deck, and AI-generated cards for any lesson, are part of Premium.",
  },
  quiz: {
    title: "Quizzes are Premium",
    blurb: "Practice quizzes with instant scoring and answer explanations are part of Premium.",
  },
  ai_tutor: {
    title: "AI Tutor is Premium",
    blurb: "Ask as many questions as you like, on any lesson, with Premium.",
  },
  ai_practice: {
    title: "AI Practice is Premium",
    blurb: "AI-generated questions, guided explanations and tutor chat are for Premium members.",
  },
  ai_recommendations: {
    title: "AI Recommendations are Premium",
    blurb: "Per-topic AI coaching on your Statistics weak areas is part of Premium.",
  },
  premium_contest: {
    title: "This contest is Premium",
    blurb: "Premium contests, their editorial and the full standings are for Premium members.",
  },
};

/**
 * What Premium buys. The same list is shown for every subject, because it is one
 * plan: the headline above it names what was blocked, these rows justify the price.
 */
export const PREMIUM_PERKS: Array<{ icon: LucideIcon; label: string; note: string }> = [
  { icon: BookOpen, label: "Every chapter and note", note: "All premium lessons unlocked in full" },
  { icon: Video, label: "Full video lessons", note: "Recorded explanations for each topic" },
  { icon: Layers, label: "Unlimited flashcards", note: "Built-in decks plus AI-generated cards" },
  { icon: PenLine, label: "Quizzes with feedback", note: "Instant scoring and weak-topic tracking" },
  { icon: Bot, label: "AI tutor and AI practice", note: "Ask about any part of a lesson you select" },
  { icon: Trophy, label: "Premium contests", note: "Contest editorials and full standings" },
];

/** Referral-to-unlock state, as the Academy API reports it for one module. */
export interface ReferralState {
  enabled: boolean;
  required: number;
  current: number;
  unlocked: boolean;
}

/**
 * A premium contest is locked when the server attached a `lock` (it decides per
 * program from the student's entitlements) or, as a fallback for unscoped
 * contests, when the student has no active plan at all.
 */
export function isContestLocked(
  contest: { type?: string; lock?: unknown },
  hasAnyPlan: boolean | undefined,
): boolean {
  if (contest.type !== "premium") return false;
  return !!contest.lock || !hasAnyPlan;
}
