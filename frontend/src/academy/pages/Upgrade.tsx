import { BookOpen, Bot, Check, Layers, ShieldCheck, Sparkles, Video } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BackButton } from "../components/PageHeader";
import { useAcademy } from "../context/AcademyContext";

const PERKS = [
  { icon: BookOpen, label: "All chapters & notes" },
  { icon: Video, label: "Full video lessons" },
  { icon: Layers, label: "Unlimited flashcards" },
  { icon: Bot, label: "AI tutor & quizzes" },
];

/** Placeholder for the existing payment flow (see victory-contest /payment). */
export default function Upgrade() {
  const { isPremium, setPremiumPreview } = useAcademy();
  const navigate = useNavigate();
  return (
    <div className="space-y-5 p-4">
      <BackButton />
      <div className="rounded-3xl bg-gradient-to-br from-yellow-fix-600 to-orange-fix-700 p-6 text-center text-white">
        <Sparkles className="mx-auto h-10 w-10" />
        <h1 className="mt-2 font-nunito text-2xl font-extrabold">Victory Premium</h1>
      </div>
      <ul className="grid grid-cols-2 gap-3">
        {PERKS.map(({ icon: Icon, label }) => (
          <li key={label} className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-100 text-yellow-700"><Icon className="h-5 w-5" /></span>
            <span className="text-xs font-bold">{label}</span>
          </li>
        ))}
      </ul>
      <Button className="h-14 w-full rounded-2xl bg-blue-fix-600 text-lg font-bold text-white" onClick={async () => { await setPremiumPreview(true); toast.success("Premium unlocked (mock)"); navigate(-1); }}>
        {isPremium ? <><Check className="h-5 w-5" /> You're Premium</> : "Pay & unlock (mock)"}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />Connects to the existing payment flow</p>
    </div>
  );
}
