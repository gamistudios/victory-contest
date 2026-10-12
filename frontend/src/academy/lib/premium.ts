import { BookOpen, Bot, Layers, PenLine, Video, type LucideIcon } from "lucide-react";
import type { ResourceKey } from "@/types/academy";

/**
 * What the student tapped into. `plan` is the general pitch (the Home banner);
 * every other case is a specific locked resource, so the sheet can name it
 * instead of showing generic "Premium content" text.
 */
export type PremiumSubject = ResourceKey | "plan";

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
};

/** What Premium buys, shown in the sheet. The plan pitch, not the locked item. */
export const PREMIUM_PERKS: Array<{ icon: LucideIcon; label: string; note: string }> = [
  { icon: BookOpen, label: "Every chapter and note", note: "All premium lessons unlocked in full" },
  { icon: Video, label: "Full video lessons", note: "Recorded explanations for each topic" },
  { icon: Layers, label: "Unlimited flashcards", note: "Built-in decks plus AI-generated cards" },
  { icon: PenLine, label: "Quizzes with feedback", note: "Instant scoring and weak-topic tracking" },
  { icon: Bot, label: "AI tutor, any time", note: "Ask about any part of a lesson you select" },
];
