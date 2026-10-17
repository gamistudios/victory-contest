import {
  Atom, Award, BookOpen, Binary, Calculator, Compass, Cpu, Dna, FlaskConical, GraduationCap, Globe, Landmark,
  Layers, MapPin, School, Sparkles, Target, TrendingUp, Zap, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Atom, Award, BookOpen, Binary, Calculator, Compass, Cpu, Dna, FlaskConical, GraduationCap, Globe, Landmark,
  Layers, MapPin, School, Sparkles, Target, TrendingUp, Zap,
};
export const iconFor = (name?: string): LucideIcon => (name && ICONS[name]) || BookOpen;

/**
 * Subject colour themes. Class strings are written out in full so Tailwind's JIT
 * keeps them. They use victory-contest's palette scales (…-100/-700 flip in dark
 * mode, …-fix-600 stays a solid fill), so contrast stays AAA in both themes.
 */
export interface Tone {
  soft: string; // tinted tile background + text
  solid: string; // solid fill w/ white text
  text: string;
  bar: string; // progress bar fill
  stroke: string; // svg ring stroke
  grad: string; // hero gradient
}

export const TONES: Record<string, Tone> = {
  blue: { soft: "bg-blue-100 text-blue-700", solid: "bg-blue-fix-600 text-white", text: "text-blue-700", bar: "bg-blue-fix-600", stroke: "stroke-blue-fix-600", grad: "from-blue-fix-700 to-blue-fix-500" },
  amber: { soft: "bg-amber-100 text-amber-700", solid: "bg-amber-fix-600 text-white", text: "text-amber-700", bar: "bg-amber-fix-600", stroke: "stroke-amber-fix-600", grad: "from-amber-fix-700 to-amber-fix-500" },
  emerald: { soft: "bg-emerald-100 text-emerald-700", solid: "bg-emerald-fix-600 text-white", text: "text-emerald-700", bar: "bg-emerald-fix-600", stroke: "stroke-emerald-fix-600", grad: "from-emerald-fix-700 to-emerald-fix-500" },
  teal: { soft: "bg-teal-100 text-teal-700", solid: "bg-teal-fix-600 text-white", text: "text-teal-700", bar: "bg-teal-fix-600", stroke: "stroke-teal-fix-600", grad: "from-teal-fix-700 to-teal-fix-500" },
  indigo: { soft: "bg-indigo-100 text-indigo-700", solid: "bg-indigo-fix-600 text-white", text: "text-indigo-700", bar: "bg-indigo-fix-600", stroke: "stroke-indigo-fix-600", grad: "from-indigo-fix-700 to-indigo-fix-500" },
  rose: { soft: "bg-rose-100 text-rose-700", solid: "bg-rose-fix-600 text-white", text: "text-rose-700", bar: "bg-rose-fix-600", stroke: "stroke-rose-fix-600", grad: "from-rose-fix-700 to-rose-fix-500" },
  cyan: { soft: "bg-cyan-100 text-cyan-700", solid: "bg-cyan-fix-600 text-white", text: "text-cyan-700", bar: "bg-cyan-fix-600", stroke: "stroke-cyan-fix-600", grad: "from-cyan-fix-700 to-cyan-fix-500" },
  violet: { soft: "bg-violet-100 text-violet-700", solid: "bg-violet-fix-600 text-white", text: "text-violet-700", bar: "bg-violet-fix-600", stroke: "stroke-violet-fix-600", grad: "from-violet-fix-700 to-violet-fix-500" },
  purple: { soft: "bg-purple-100 text-purple-700", solid: "bg-purple-fix-600 text-white", text: "text-purple-700", bar: "bg-purple-fix-600", stroke: "stroke-purple-fix-600", grad: "from-purple-fix-700 to-purple-fix-500" },
};
export const toneFor = (theme?: string): Tone => TONES[theme ?? ""] ?? TONES.blue;
export const TONE_NAMES = Object.keys(TONES);

export const LEVEL_SHORT: Record<string, string> = {
  "grade-9": "G9",
  "grade-10": "G10",
  "grade-11": "G11",
  "grade-12": "G12",
  remedial: "Remedial",
  "exit-exam": "Exit Exam",
  "other-programs": "Short Courses",
};
export const STREAM_SHORT: Record<string, string> = {
  "natural-science": "Natural",
  "social-science": "Social",
  common: "Common",
};

export const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ""}`.trim() : `${m}m`);
export const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
export const fmtBytes = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);

/** Data-driven label: the program's own short_code first, legacy map as a fallback, then the id. */
export const levelShort = (programs: { id: string; short_code?: string; name?: string }[] | undefined, id: string): string => {
  const p = programs?.find((x) => x.id === id);
  return p?.short_code || p?.name || LEVEL_SHORT[id] || id;
};
export const streamShort = (streams: { id: string; name?: string }[] | undefined, id: string): string =>
  streams?.find((x) => x.id === id)?.name ?? STREAM_SHORT[id] ?? id;
