import { PremiumSheet } from "@/shared/ui/PremiumSheet";
import type { PremiumSubject, ReferralState } from "@/lib/premium";
import { useAcademy } from "../context/AcademyContext";

export type { ReferralState };

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /**
   * What the student tapped, so the gate names the blocked resource instead of
   * generic "Premium content". Defaults to the general plan pitch.
   */
  subject?: PremiumSubject;
  /** Only needed for the invite path: the referral link unlocks this lesson. */
  moduleId?: string;
  referral?: ReferralState | null;
  onUnlocked?: () => void;
  /** Program the locked module belongs to (per-program access). */
  programId?: string;
}

/**
 * Academy's view of the app-wide premium sheet: it supplies the paid state and
 * the student behind the referral link, and keeps the invite-to-unlock path that
 * only lessons have. Contest screens use <PremiumSheet> through usePremiumSheet().
 */
export function UpgradeSheet({ open, onOpenChange, subject = "plan", moduleId, referral, onUnlocked, programId }: Props) {
  const { isPremium, student } = useAcademy();
  return (
    <PremiumSheet
      open={open}
      onOpenChange={onOpenChange}
      subject={subject}
      isPremium={isPremium}
      referral={referral}
      referrerId={student?.id}
      moduleId={moduleId}
      onUnlocked={onUnlocked}
      programId={programId ?? student?.level_id}
    />
  );
}
