import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { Check, Layers, RefreshCw, RotateCcw, Sparkles, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Difficulty, Flashcard } from "@/types/academy";
import { aiGenerateFlashcards, postFlashcardReview } from "@/services/academy/academyApi";
import { Markdown } from "../components/Markdown";
import { ProgressBar, ProgressRing } from "../components/ProgressRing";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTelegram } from "@/hooks/useTelegram";

interface Props {
  moduleId: string;
  deck: Flashcard[];
  initialMastered: string[];
  initialStruggling: string[];
  aiLocked: boolean;
  onNeedUpgrade: () => void;
}

type Phase = "idle" | "run" | "done";
const DIFFS: Array<Difficulty | "Mixed"> = ["Mixed", "Easy", "Medium", "Hard"];

export function CardsTab({ moduleId, deck, initialMastered, initialStruggling, aiLocked, onNeedUpgrade }: Props) {
  const [source, setSource] = useState<Flashcard[]>(deck);
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [mastered, setMastered] = useState<string[]>(initialMastered);
  const [struggling, setStruggling] = useState<string[]>(initialStruggling);
  const [sessionMastered, setSessionMastered] = useState<string[]>([]);
  const [sessionStruggling, setSessionStruggling] = useState<string[]>([]);
  const [diff, setDiff] = useState<Difficulty | "Mixed">("Mixed");
  const [busy, setBusy] = useState(false);
  const [isAi, setIsAi] = useState(false);
  const { hapticFeedback } = useTelegram();

  useEffect(() => {
    setSource(deck);
  }, [deck]);

  const start = (cards: Flashcard[]) => {
    setQueue(cards);
    setIdx(0);
    setSessionMastered([]);
    setSessionStruggling([]);
    setPhase("run");
  };

  const answer = useCallback((known: boolean) => {
    const card = queue[idx];
    if (!card) return;
    hapticFeedback("impact", known ? "light" : "medium");
    const sm = known ? [...sessionMastered, card.id] : sessionMastered;
    const ss = known ? sessionStruggling : [...sessionStruggling, card.id];
    setSessionMastered(sm);
    setSessionStruggling(ss);
    if (idx + 1 >= queue.length) {
      setPhase("done");
      if (!isAi) {
        const m = Array.from(new Set([...mastered.filter((x) => !ss.includes(x)), ...sm]));
        const s = Array.from(new Set([...struggling.filter((x) => !sm.includes(x)), ...ss]));
        setMastered(m);
        setStruggling(s);
        postFlashcardReview(moduleId, m, s).catch(() => undefined);
      }
    } else setIdx(idx + 1);
  }, [queue, idx, sessionMastered, sessionStruggling, isAi, mastered, struggling, moduleId, hapticFeedback]);

  const undo = () => {
    if (idx === 0) return;
    const prev = queue[idx - 1];
    setSessionMastered((a) => a.filter((x) => x !== prev.id));
    setSessionStruggling((a) => a.filter((x) => x !== prev.id));
    setIdx(idx - 1);
  };

  const generate = async () => {
    if (aiLocked) return onNeedUpgrade();
    setBusy(true);
    try {
      const cards = await aiGenerateFlashcards({ module_id: moduleId, count: 6, difficulty: diff });
      setSource(cards);
      setIsAi(true);
      toast.success(`${cards.length} new cards ready`);
      start(cards);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------ idle ------------------------------ */
  if (phase === "idle") {
    const total = source.length;
    const m = isAi ? 0 : mastered.filter((id) => deck.some((c) => c.id === id)).length;
    const s = isAi ? 0 : struggling.filter((id) => deck.some((c) => c.id === id)).length;
    const recall = m + s ? Math.round((m / (m + s)) * 100) : 0;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4 rounded-3xl bg-gradient-to-br from-violet-fix-700 to-violet-fix-500 p-5 text-white">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20"><Layers className="h-8 w-8" /></div>
          <div className="min-w-0">
            <p className="font-nunito text-2xl font-extrabold">{total} cards</p>
            <p className="text-sm font-semibold text-white/80">{isAi ? "AI-generated deck" : m + s ? `${recall}% recall` : "Not started"}</p>
          </div>
        </div>
        {!isAi && (m > 0 || s > 0) && (
          <div className="grid grid-cols-2 gap-3">
            <Stat icon={<Check className="h-5 w-5" />} value={m} label="Mastered" cls="bg-green-100 text-green-800" />
            <Stat icon={<RotateCcw className="h-5 w-5" />} value={s} label="To review" cls="bg-red-100 text-red-800" />
          </div>
        )}
        <Button disabled={!total} onClick={() => start(source)} className="h-14 w-full rounded-2xl bg-blue-fix-600 text-lg font-bold text-white">Start deck</Button>
        {!isAi && s > 0 && <Button variant="outline" className="h-12 w-full rounded-2xl" onClick={() => start(deck.filter((c) => struggling.includes(c.id)))}>Review {s} missed</Button>}

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold"><Sparkles className="h-4 w-4 text-violet-700" /> Generate with AI</p>
          <div className="mb-3 grid grid-cols-4 gap-2">
            {DIFFS.map((d) => <button key={d} onClick={() => setDiff(d)} aria-pressed={diff === d} className={cn("h-10 rounded-lg border text-xs font-bold", diff === d ? "border-violet-fix-600 bg-violet-100 text-violet-800" : "border-border")}>{d}</button>)}
          </div>
          <Button variant="outline" disabled={busy} onClick={generate} className="h-12 w-full rounded-xl">{busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} New set from this lesson</Button>
          {isAi && <button onClick={() => { setSource(deck); setIsAi(false); }} className="mt-2 w-full text-center text-xs font-bold text-blue-700 underline">Back to the lesson deck</button>}
        </div>
      </div>
    );
  }

  /* ------------------------------ done ------------------------------ */
  if (phase === "done") {
    const total = sessionMastered.length + sessionStruggling.length;
    const pct = total ? Math.round((sessionMastered.length / total) * 100) : 0;
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <ProgressRing value={pct} size={120} stroke={10} arcClass={pct >= 70 ? "stroke-green-fix-600" : "stroke-amber-fix-600"} />
        <h3 className="font-nunito text-2xl font-extrabold">{pct >= 80 ? "Great recall!" : pct >= 50 ? "Getting there" : "Keep practising"}</h3>
        <p className="text-sm text-muted-foreground">{sessionMastered.length} known · {sessionStruggling.length} to review</p>
        <div className="grid w-full gap-2">
          {sessionStruggling.length > 0 && <Button className="h-12 rounded-xl bg-blue-fix-600 font-bold text-white" onClick={() => start(queue.filter((c) => sessionStruggling.includes(c.id)))}>Review missed ({sessionStruggling.length})</Button>}
          <Button variant="outline" className="h-12 rounded-xl" onClick={() => start(source)}>Restart deck</Button>
          <Button variant="outline" className="h-12 rounded-xl" disabled={busy} onClick={generate}><Sparkles className="h-4 w-4" /> Generate new cards</Button>
          <Button variant="ghost" className="h-12" onClick={() => setPhase("idle")}>Done</Button>
        </div>
      </div>
    );
  }

  /* ------------------------------- run ------------------------------- */
  const card = queue[idx];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setPhase("idle")} aria-label="Exit deck" className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted"><X className="h-5 w-5" /></button>
        <ProgressBar value={(idx / queue.length) * 100} className="flex-1" barClass="bg-violet-fix-600" />
        <span className="text-sm font-bold tabular-nums">{idx + 1}/{queue.length}</span>
      </div>
      <div className="relative mx-auto h-[26rem] w-full max-w-sm">
        {queue[idx + 1] && <div aria-hidden className="absolute inset-0 translate-y-3 scale-[0.95] rounded-3xl border border-border bg-muted" />}
        <SwipeCard key={card.id + idx} card={card} onAnswer={answer} />
      </div>
      <div className="mx-auto flex w-full max-w-sm items-center justify-between gap-3">
        <button onClick={() => answer(false)} className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-red-100 text-sm font-extrabold text-red-900 active:scale-95"><X className="h-5 w-5" /> Again</button>
        <button onClick={undo} disabled={idx === 0} aria-label="Undo" className="flex h-12 w-12 items-center justify-center rounded-full bg-muted disabled:opacity-30"><Undo2 className="h-5 w-5" /></button>
        <button onClick={() => answer(true)} className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-green-100 text-sm font-extrabold text-green-900 active:scale-95"><Check className="h-5 w-5" /> Got it</button>
      </div>
      <p className="text-center text-xs text-muted-foreground">Tap to flip · swipe right if you knew it, left to see it again</p>
    </div>
  );
}

function Stat({ icon, value, label, cls }: { icon: React.ReactNode; value: number; label: string; cls: string }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl p-3", cls)}>{icon}<div><p className="text-xl font-extrabold leading-none">{value}</p><p className="text-xs font-bold">{label}</p></div></div>
  );
}

function SwipeCard({ card, onAnswer }: { card: Flashcard; onAnswer: (known: boolean) => void }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-14, 14]);
  const knownOp = useTransform(x, [20, 110], [0, 1]);
  const againOp = useTransform(x, [-110, -20], [1, 0]);
  const [flipped, setFlipped] = useState(false);
  const moved = useRef(false);

  const face = "absolute inset-0 flex flex-col rounded-3xl border border-border bg-card p-5 shadow-lg [backface-visibility:hidden]";
  return (
    <motion.div
      style={{ x, rotate }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragStart={() => (moved.current = true)}
      onDragEnd={(_, i) => {
        if (i.offset.x > 110 || i.velocity.x > 600) animate(x, 500, { duration: 0.2, onComplete: () => onAnswer(true) });
        else if (i.offset.x < -110 || i.velocity.x < -600) animate(x, -500, { duration: 0.2, onComplete: () => onAnswer(false) });
        else animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
        setTimeout(() => (moved.current = false), 0);
      }}
      onClick={() => !moved.current && setFlipped((f) => !f)}
      className="absolute inset-0 cursor-grab touch-pan-y active:cursor-grabbing"
      role="button"
      tabIndex={0}
      aria-label={flipped ? "Answer. Tap to show question" : "Question. Tap to show answer"}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") setFlipped((f) => !f); if (e.key === "ArrowRight") onAnswer(true); if (e.key === "ArrowLeft") onAnswer(false); }}
    >
      <div className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]" style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0)" }}>
        <div className={face}>
          <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground"><span>Question</span><span className="rounded-full bg-muted px-2 py-0.5">{card.difficulty}</span></div>
          <div className="flex flex-1 items-center justify-center overflow-y-auto text-center"><Markdown source={card.question} className="!text-[1.15rem] font-bold [&_p]:m-0" /></div>
          <p className="text-center text-xs text-muted-foreground">{card.source_section}</p>
        </div>
        <div className={cn(face, "[transform:rotateY(180deg)] border-violet-300 bg-violet-50 text-violet-950")}>
          <div className="text-[11px] font-extrabold uppercase tracking-wider opacity-70">Answer</div>
          <div className="flex-1 space-y-3 overflow-y-auto py-2">
            <Markdown source={card.answer} className="!text-[1.05rem] font-semibold [&_p]:m-0" />
            {card.explanation && <p className="rounded-xl bg-white/60 p-3 text-sm">{card.explanation}</p>}
          </div>
          <div className="flex flex-wrap gap-1.5">{(card.tags ?? []).map((t) => <span key={t} className="rounded-full bg-violet-200 px-2 py-0.5 text-[10px] font-bold">{t}</span>)}</div>
        </div>
      </div>
      <motion.span style={{ opacity: knownOp }} className="pointer-events-none absolute left-4 top-4 rounded-xl border-4 border-green-fix-600 px-3 py-1 text-lg font-extrabold text-green-700 -rotate-12">GOT IT</motion.span>
      <motion.span style={{ opacity: againOp }} className="pointer-events-none absolute right-4 top-4 rounded-xl border-4 border-red-fix-500 px-3 py-1 text-lg font-extrabold text-red-700 rotate-12">AGAIN</motion.span>
    </motion.div>
  );
}
