/**
 * Deterministic "AI" stand-ins used by the mock API.
 *
 * They parse the module's own markdown / transcript, so generated cards and
 * quizzes are always grounded in the actual lesson. The real backend will
 * replace these with an LLM call that returns the same JSON shapes.
 */
import type {
  Difficulty,
  Flashcard,
  LearningModule,
  QuestionType,
  QuizQuestion,
  TutorMode,
} from "@/types/academy";

let counter = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}${(counter++).toString(36)}`;

function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function shuffle<T>(arr: T[], seed: number): T[] {
  const r = rng(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ------------------------------ parsing ------------------------------ */

interface Block {
  kind: "definition" | "tip" | "example" | "warning" | "key-concept" | "note" | "bullets" | "para" | "formula";
  section: string;
  title?: string;
  text: string;
  items?: string[];
}

export function parseBlocks(md: string): Block[] {
  const lines = md.split("\n");
  const blocks: Block[] = [];
  let section = "Overview";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const h = line.match(/^#{1,3}\s+(.*)$/);
    if (h) {
      section = h[1].trim();
      i++;
      continue;
    }
    if (line.startsWith(":::")) {
      const kind = line.replace(":::", "").trim().toLowerCase() as Block["kind"];
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(":::")) body.push(lines[i++]);
      i++;
      const first = body.find((b) => b.trim()) ?? "";
      const title = first.match(/^\*\*(.+?)\*\*:?\s*$/)?.[1] ?? first.match(/^\*\*(.+?)\*\*/)?.[1];
      const rest = body
        .filter((b) => b !== first)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      blocks.push({ kind, section, title: title?.replace(/:$/, ""), text: rest || first.replace(/\*\*/g, ""), items: undefined });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, "").trim());
      blocks.push({ kind: "bullets", section, text: items.join("; "), items });
      continue;
    }
    if (line.trim().startsWith("$$") || /^\*\*\$.+\$\*\*$/.test(line.trim())) {
      blocks.push({ kind: "formula", section, text: line.trim() });
      i++;
      continue;
    }
    if (line.trim() && !line.startsWith("|") && !line.startsWith(">") && !line.startsWith("```")) {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#|:::|\s*[-*]\s|\||>|```)/.test(lines[i])) para.push(lines[i++]);
      blocks.push({ kind: "para", section, text: para.join(" ").trim() });
      continue;
    }
    i++;
  }
  return blocks;
}

const clean = (s: string) => s.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
const firstSentences = (s: string, n = 2) => (clean(s).match(/[^.!?]+[.!?]+(\s|$)/g) ?? [clean(s)]).slice(0, n).join("").trim();
const diffFor = (d: Difficulty | "Mixed", i: number): Difficulty =>
  d === "Mixed" ? (["Easy", "Medium", "Hard"] as Difficulty[])[i % 3] : d;

/* ----------------------------- flashcards ----------------------------- */

export function generateFlashcardsFromMarkdown(
  mod: Pick<LearningModule, "id" | "title" | "reading_markdown" | "video_lesson">,
  count: number,
  difficulty: Difficulty | "Mixed",
  salt = 0,
): Flashcard[] {
  const blocks = parseBlocks(mod.reading_markdown);
  const pool: Array<Omit<Flashcard, "id" | "difficulty" | "source_module_id">> = [];

  for (const b of blocks) {
    if ((b.kind === "definition" || b.kind === "key-concept") && b.title) {
      pool.push({
        question: `What is ${b.title.replace(/\(.*\)/, "").trim()}?`,
        answer: firstSentences(b.text, 2) || b.text,
        explanation: `Definition from “${b.section}”.`,
        source_section: b.section,
        tags: ["Definition"],
      });
    } else if (b.kind === "tip" || b.kind === "warning") {
      pool.push({
        question: `Exam strategy: what should you remember about “${b.section}”?`,
        answer: firstSentences(b.text, 2) || b.text,
        explanation: b.kind === "warning" ? "Common pitfall flagged in the lesson." : "High-yield exam tip from the lesson.",
        source_section: b.section,
        tags: [b.kind === "warning" ? "Pitfall" : "Exam Tip"],
      });
    } else if (b.kind === "bullets" && b.items && b.items.length >= 2) {
      b.items.slice(0, 3).forEach((it) => {
        const f = clean(it);
        if (f.length > 18) {
          pool.push({
            question: `Complete the key idea in “${b.section}”: ${f.split(" ").slice(0, 4).join(" ")} …`,
            answer: f,
            explanation: "Key point from the lesson summary.",
            source_section: b.section,
            tags: ["Key Idea"],
          });
        }
      });
    } else if (b.kind === "example") {
      pool.push({
        question: `Walk through the worked example in “${b.section}”.`,
        answer: firstSentences(b.text, 2),
        explanation: "Worked example from the lesson.",
        source_section: b.section,
        tags: ["Example"],
      });
    }
  }

  // Video transcript contributes recall prompts too.
  mod.video_lesson?.transcript.slice(1, 3).forEach((t) => {
    pool.push({
      question: `At ${t.time_str} the instructor explains…`,
      answer: t.text,
      explanation: "Taken from the video transcript.",
      source_section: `Video ${t.time_str}`,
      tags: ["Video"],
    });
  });

  if (pool.length === 0) {
    pool.push({
      question: `What is the main idea of “${mod.title}”?`,
      answer: firstSentences(mod.reading_markdown.replace(/^#.*$/gm, ""), 2) || mod.title,
      explanation: "Summary of the module.",
      source_section: "Overview",
      tags: ["Overview"],
    });
  }

  const ordered = salt ? shuffle(pool, hash(mod.id) + salt) : pool;
  const out: Flashcard[] = [];
  for (let i = 0; i < count; i++) {
    const p = ordered[i % ordered.length];
    if (i >= ordered.length && salt === 0) break; // do not repeat identical cards on first generation
    out.push({
      ...p,
      id: uid(`fc-${mod.id.replace("mod-", "")}`),
      difficulty: diffFor(difficulty, i),
      source_module_id: mod.id,
    });
  }
  return out;
}

/* ------------------------------- quiz -------------------------------- */

const GENERIC_DISTRACTORS = [
  "It only applies to a special case and cannot be generalised.",
  "It is unrelated to the topic covered in this lesson.",
  "The opposite statement is true; the relationship is reversed.",
  "It describes a different concept that is often confused with this one.",
];

export function generateQuizQuestions(
  mod: Pick<LearningModule, "id" | "title" | "reading_markdown" | "video_lesson" | "flashcard_deck" | "quiz">,
  count: number,
  difficulty: Difficulty | "Mixed",
  types: QuestionType[] = ["multiple_choice", "true_false"],
  salt = 0,
): QuizQuestion[] {
  const base = generateFlashcardsFromMarkdown(mod as LearningModule, 12, "Mixed", salt);
  const cards = base.length ? base : mod.flashcard_deck;
  const existing = mod.quiz?.questions ?? [];
  const out: QuizQuestion[] = [];
  const seed = hash(mod.id) + salt;

  const answers = cards.map((c) => c.answer);
  for (let i = 0; i < count; i++) {
    const t = types[i % types.length];
    const card = cards[i % Math.max(cards.length, 1)];
    if (!card) break;
    const d = diffFor(difficulty, i);

    if (t === "true_false") {
      const makeTrue = (hash(card.id) + i) % 2 === 0;
      const wrong = shuffle(answers.filter((a) => a !== card.answer), seed + i)[0] ?? GENERIC_DISTRACTORS[0];
      out.push({
        id: uid("qz"),
        type: "true_false",
        question: `True or false: ${card.question.replace(/\?$/, "")} — “${clean(makeTrue ? card.answer : wrong)}”`,
        options: ["True", "False"],
        correct_answers: [makeTrue ? 0 : 1],
        explanation: makeTrue ? `Correct. ${card.explanation}` : `False. The correct statement is: ${clean(card.answer)}`,
        difficulty: d,
        topic_tag: card.source_section,
      });
      continue;
    }

    if (t === "scenario") {
      const opts = shuffle([card.answer, ...shuffle(answers.filter((a) => a !== card.answer), seed + i).slice(0, 2), GENERIC_DISTRACTORS[1]].slice(0, 4), seed + i * 7);
      out.push({
        id: uid("qz"),
        type: "scenario",
        scenario_context: `You are revising “${mod.title}” and meet a question on “${card.source_section}”.`,
        question: card.question,
        options: opts,
        correct_answers: [opts.indexOf(card.answer)],
        explanation: card.explanation,
        hint: `Think about the lesson section “${card.source_section}”.`,
        difficulty: d,
        topic_tag: card.source_section,
      });
      continue;
    }

    if (t === "multiple_answer") {
      const correct = shuffle(cards.map((c) => c.answer), seed + i).slice(0, 2);
      const wrong = [...GENERIC_DISTRACTORS.slice(0, 2)];
      const opts = shuffle([...correct, ...wrong], seed + i * 3);
      out.push({
        id: uid("qz"),
        type: "multiple_answer",
        question: `Select ALL statements that are true about “${mod.title}”.`,
        options: opts,
        correct_answers: correct.map((c) => opts.indexOf(c)).sort(),
        explanation: "Both highlighted statements come directly from the lesson.",
        difficulty: d,
        topic_tag: card.source_section,
      });
      continue;
    }

    // multiple_choice
    const distractors = shuffle(answers.filter((a) => a !== card.answer), seed + i);
    const opts = shuffle([card.answer, ...distractors.slice(0, 3), ...GENERIC_DISTRACTORS].slice(0, 4), seed + i * 5);
    out.push({
      id: uid("qz"),
      type: "multiple_choice",
      question: card.question,
      options: opts,
      correct_answers: [opts.indexOf(card.answer)],
      explanation: card.explanation,
      hint: `Re-read “${card.source_section}”.`,
      difficulty: d,
      topic_tag: card.source_section,
    });
  }

  // If a hand-written quiz exists, mix it in first so students still see curated items.
  if (existing.length && salt === 0 && count >= existing.length) {
    return [...existing, ...out].slice(0, count);
  }
  return out;
}

/* ------------------------------- tutor ------------------------------- */

const ANALOGIES: Array<[RegExp, string]> = [
  [/derivative|rate of change|slope/i, "Think of a car's speedometer: it doesn't tell you how far you've gone, only how fast you're changing position *right now*."],
  [/integral|area|antiderivative/i, "Imagine filling a bathtub: the integral adds up all the tiny amounts of water that flowed in each second."],
  [/sequence|progression|arithmetic/i, "It's like climbing stairs where every step is exactly the same height — each term is one step above the last."],
  [/geometric|ratio/i, "Picture a rumour spreading: each person tells the same number of new people, so the growth multiplies every round."],
  [/equilibrium|le chatelier/i, "Imagine a crowded bus: when someone steps on, others naturally shuffle to rebalance. A system at equilibrium 'shuffles' to offset any push."],
  [/dna|replication|gene/i, "DNA is like a recipe book; replication is photocopying the whole book before a cell divides."],
  [/gdp|inflation|economy/i, "Think of an economy as a big shop: GDP is the total value of everything sold, and inflation is the price tags slowly creeping up."],
  [/limit|continuity/i, "A limit is like walking toward a door: you can say exactly where you're heading even if you never reach it."],
  [/vector|dot|cross/i, "A vector is a treasure-map instruction: direction AND distance. The dot product asks 'how much do two instructions point the same way?'"],
  [/stack|queue/i, "A stack is a pile of plates (last on, first off); a queue is a line at a shop (first in, first served)."],
  [/wave|interference/i, "Two ripples on a pond: where crests meet crests, the wave grows; where a crest meets a trough, they cancel."],
  [/thermodynamic|heat|carnot/i, "A heat engine is like a waterwheel — it can only work if heat 'flows downhill' from hot to cold, and some always escapes."],
];

export function tutorReply(
  mod: Pick<LearningModule, "title" | "reading_markdown">,
  message: string,
  mode: TutorMode,
  selection?: string,
): string {
  const blocks = parseBlocks(mod.reading_markdown);
  const def = blocks.find((b) => b.kind === "definition" || b.kind === "key-concept");
  const bullets = blocks.find((b) => b.kind === "bullets" && b.items?.length);
  const tip = blocks.find((b) => b.kind === "tip");
  const focus = selection?.trim() || message;
  const analogy =
    ANALOGIES.find(([re]) => re.test(`${mod.title} ${focus}`))?.[1] ??
    `Think of ${mod.title.toLowerCase()} like learning a new game: first learn the rules (definitions), then practise with simple moves (examples).`;

  if (mode === "analogy")
    return `Here's an analogy for **${mod.title}**:\n\n${analogy}\n\n${def ? `In the lesson's words: ${firstSentences(def.text, 1)}` : ""}\n\nWant an example or a quick quiz next?`.trim();

  if (mode === "explain")
    return `Let's break it down simply.\n\n${selection ? `You highlighted: “${selection.slice(0, 160)}”\n\n` : ""}${def ? `**${def.title ?? "Core idea"}** — ${firstSentences(def.text, 2)}` : `The key idea of ${mod.title} is in the first section of the notes.`}\n\n${analogy}\n\nDoes that make sense? I can also give a worked example.`;

  if (mode === "example")
    return `Here's a quick example for **${mod.title}**:\n\n${bullets?.items?.[0] ? `Take this key idea — *${clean(bullets.items[0])}* — and apply it step by step: (1) write down what is given, (2) pick the rule above, (3) substitute and simplify, (4) sanity-check the result.` : "Pick a small number case, apply the rule step by step, then check your answer."}\n\n${tip ? `💡 ${firstSentences(tip.text, 1)}` : ""}`.trim();

  if (mode === "summary")
    return `**Quick summary — ${mod.title}**\n\n${(bullets?.items ?? []).slice(0, 4).map((b) => `- ${clean(b)}`).join("\n") || (def ? `- ${firstSentences(def.text, 1)}` : "- Review the notes above.")}\n\n${tip ? `💡 ${firstSentences(tip.text, 1)}` : ""}`.trim();

  // free chat
  const lower = message.toLowerCase();
  if (/quiz|test me/.test(lower)) return "Great idea! Open the **Quiz** tab and tap *Generate with AI* — I'll build questions from this lesson.";
  if (/flash/.test(lower)) return "Open the **Cards** tab and tap *Generate* to get fresh flashcards from this lesson.";
  return `Good question about **${mod.title}**.\n\n${def ? `${firstSentences(def.text, 2)}\n\n` : ""}${analogy}\n\n${tip ? `💡 ${firstSentences(tip.text, 1)}\n\n` : ""}Ask me to *explain simply*, *give an analogy*, or *show an example* if you want it another way.`;
}

/* ------------------------- admin-only generators ------------------------- */

export function generateSummary(mod: Pick<LearningModule, "title" | "reading_markdown">): string {
  const blocks = parseBlocks(mod.reading_markdown);
  const def = blocks.find((b) => b.kind === "definition");
  const bullets = blocks.filter((b) => b.kind === "bullets").flatMap((b) => b.items ?? []).slice(0, 4);
  return `**${mod.title}** — ${def ? firstSentences(def.text, 1) : "overview of the topic."} Key points: ${bullets.map(clean).join("; ") || "see the lesson notes"}.`;
}

export function generateKeyConcepts(mod: Pick<LearningModule, "reading_markdown">): string[] {
  const blocks = parseBlocks(mod.reading_markdown);
  const titled = blocks.filter((b) => b.title).map((b) => `${b.title}: ${firstSentences(b.text, 1)}`);
  const bullets = blocks.filter((b) => b.kind === "bullets").flatMap((b) => b.items ?? []).map(clean);
  return [...titled, ...bullets].slice(0, 8);
}
