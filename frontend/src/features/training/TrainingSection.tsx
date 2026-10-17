// Training block for the Home and Practice tabs: shows the active tracks the student can start,
// their own progress, or an invitation to join the Training program. Renders nothing for students whose
// programs have no habits and who have nothing to join. Private: no ranking, no points.
import { useNavigate, Link } from "react-router-dom";
import { ChevronRight, Flame } from "lucide-react";
import { usePremiumSheet } from "@/context/PremiumSheetContext";
import { CardSkeleton, EmptyState, InlineError } from "@/shared/ui/States";
import TrackCard from "./TrackCard";
import { useTrainingOverview, type HabitPlanView } from "./api";

export default function TrainingSection({ limit }: { limit?: number }) {
  const nav = useNavigate();
  const premium = usePremiumSheet();
  const t = useTrainingOverview();

  const open = (p: HabitPlanView) => {
    if (p.lock) { premium.open("plan", p.lock.program_id || p.program_id); return; }
    nav(`/training?plan=${encodeURIComponent(p.id)}`);
  };

  if (!t.loading && !t.error && !t.enabled && t.joinable.length === 0) return null;

  const shown = limit ? t.plans.slice(0, limit) : t.plans;
  return (
    <section aria-label="Training" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-nunito-sans flex items-center gap-1.5 text-lg font-bold text-gray-700"><Flame className="h-5 w-5 text-orange-500" aria-hidden /> Training</h2>
        {t.enabled && <Link to="/training" className="inline-flex items-center text-sm font-semibold text-blue-600">See all <ChevronRight className="h-4 w-4" aria-hidden /></Link>}
      </div>
      {t.loading && <CardSkeleton />}
      {!t.loading && t.error && <InlineError message="Could not load your tracks." onRetry={t.reload} />}
      {!t.loading && !t.error && !t.enabled && (
        <Link to="/programs" className="block rounded-2xl border border-dashed border-blue-300 bg-blue-50 p-4 dark:bg-blue-950/30">
          <p className="font-bold text-foreground">Join {t.joinable[0].name}</p>
          <p className="text-xs text-muted-foreground">Enrol to start private day-by-day tracks and keep your streak.</p>
        </Link>
      )}
      {!t.loading && !t.error && t.enabled && t.plans.length === 0 && (
        <EmptyState icon={<Flame className="h-6 w-6" />} title="No tracks yet" hint="New tracks appear here as soon as they are published." />
      )}
      {!t.loading && !t.error && shown.map((p) => <TrackCard key={p.id} plan={p} progress={t.progressOf(p.id)} onOpen={open} />)}
      {!t.loading && !t.error && limit && t.plans.length > limit && (
        <Link to="/training" className="block text-center text-sm font-semibold text-blue-600">Show all {t.plans.length} tracks</Link>
      )}
    </section>
  );
}
