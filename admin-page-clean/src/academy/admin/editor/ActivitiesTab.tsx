import { useState } from "react";
import { HelpCircle, Layers, Sparkles } from "lucide-react";
import { Segmented } from "../components/kit";
import { AiGenerateCard } from "./AiGenerateCard";
import { FlashcardsEditor } from "./FlashcardsEditor";
import { QuizEditor } from "./QuizEditor";
import type { TabProps } from "./parts";

type Sub = "flashcards" | "quiz" | "ai";

export function ActivitiesTab({ m, set, errors }: TabProps) {
  const [sub, setSub] = useState<Sub>("flashcards");
  return (
    <div className="space-y-4">
      <Segmented<Sub>
        label="Activity type"
        value={sub}
        onChange={setSub}
        className="max-w-md"
        options={[
          { value: "flashcards", label: `Cards ${m.flashcard_deck.length}`, icon: Layers },
          { value: "quiz", label: `Quiz ${m.quiz?.questions.length ?? 0}`, icon: HelpCircle },
          { value: "ai", label: "AI", icon: Sparkles },
        ]}
      />
      {sub === "flashcards" && <FlashcardsEditor cards={m.flashcard_deck} moduleId={m.id} onChange={(c) => set({ flashcard_deck: c })} />}
      {sub === "quiz" && <QuizEditor quiz={m.quiz} moduleTitle={m.title} errors={errors.quiz} onChange={(q) => set({ quiz: q })} />}
      {sub === "ai" && <AiGenerateCard moduleId={m.id} hasVideo={!!m.video_lesson} hasDocs={m.document_attachments.length > 0} />}
    </div>
  );
}
