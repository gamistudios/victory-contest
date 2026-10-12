import { Check, Gift, ShieldCheck, Share2, Sparkles, Users } from "lucide-react";
import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { PREMIUM_PERKS, PREMIUM_PITCH, type PremiumSubject, type ReferralState } from "@/lib/premium";
import { useTelegram } from "@/hooks/useTelegram";

/** Invite-to-unlock rail. Local so shared/ never reaches into a feature folder. */
function InviteProgress({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-green-fix-600 transition-[width] duration-500" style={{ width: `${v}%` }} />
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /**
   * What the student tapped. The sheet states it back ("AI Practice is Premium",
   * "This lesson is Premium") instead of generic "Premium content", so the gate
   * always explains the thing that was actually blocked.
   */
  subject: PremiumSubject;
  /** Paid students get "keep studying", never a purchase pitch. */
  isPremium: boolean;
  /**
   * Invite-to-unlock, offered only where the backend says a resource can be
   * earned with referrals (Academy lessons). Omit it and the sheet is pure pay.
   */
  referral?: ReferralState | null;
  /** Owner of the referral link; required with `referral`. */
  referrerId?: string;
  /** Module the referral unlocks, so the deep link lands on it. */
  moduleId?: string;
  onUnlocked?: () => void;
}

/**
 * The one premium surface for the whole app - Academy gates and contest gates
 * alike: what is locked, what Premium gives, how to pay, and where the backend
 * allows it, how to unlock this item for free by inviting friends.
 */
export function PremiumSheet({ open, onOpenChange, subject, isPremium, referral, referrerId, moduleId, onUnlocked }: Props) {
  const { hapticFeedback } = useTelegram();
  const navigate = useNavigate();
  // The sheet stays mounted while it slides out. Remembering the subject it was
  // opened with keeps that exit showing the same resource ("This contest is
  // Premium") instead of flipping to the provider's default plan copy.
  const lastSubject = useRef<PremiumSubject>(subject);
  if (open) lastSubject.current = subject;
  const pitch = PREMIUM_PITCH[open ? subject : lastSubject.current];
  const invite = !isPremium && !!referral?.enabled && !referral.unlocked;

  const pay = () => {
    hapticFeedback("impact", "medium");
    onOpenChange(false);
    navigate("/payment");
  };

  const share = async () => {
    hapticFeedback("impact", "light");
    // Referral deep link opens the mini app with start_param=ref_<id>_<module>;
    // AcademyContext claims it. Default is this app's own bot (same one
    // components/article/ArticleView.tsx shares to), overridable per deploy.
    const bot = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "VictoryLearningBot";
    const link = `https://t.me/${bot}?startapp=ref_${referrerId ?? "0"}_${moduleId ?? "academy"}`;
    try {
      if (navigator.share) await navigator.share({ title: "Victory Academy", text: "Study with me on Victory Academy!", url: link });
      else {
        await navigator.clipboard?.writeText(link);
        toast.success("Link copied — send it to a friend");
      }
    } catch {
      /* dismissed */
    }
    // The unlock itself happens when friends open the link (counted server-side).
    onUnlocked?.();
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90dvh]">
        <div className="shrink-0 px-5 pb-4 pt-2">
          <div className="flex items-center gap-2 text-yellow-700">
            <Sparkles className="h-5 w-5" aria-hidden />
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Victory Premium</span>
          </div>
          <DrawerTitle className="mt-1.5 font-nunito text-xl font-extrabold leading-tight">{isPremium ? "You already have Premium" : pitch.title}</DrawerTitle>
          <DrawerDescription className="mt-1 text-sm leading-snug text-muted-foreground">{isPremium ? "Every lesson, video, deck, quiz and AI tool is unlocked on your account." : pitch.blurb}</DrawerDescription>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {PREMIUM_PERKS.map(({ icon: Icon, label, note }) => (
              <li key={label} className="flex items-center gap-2.5 px-3 py-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-100 text-yellow-700"><Icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold leading-tight">{label}</span>
                  <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">{note}</span>
                </span>
                <Check className="h-4 w-4 shrink-0 text-green-600" aria-hidden />
              </li>
            ))}
          </ul>

          {invite && (
            <div className="rounded-2xl border border-border bg-muted/50 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-700"><Gift className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">Unlock this for free</p>
                  <p className="text-xs text-muted-foreground">Invite {referral?.required} {referral?.required === 1 ? "friend" : "friends"} to open this lesson with you.</p>
                </div>
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <InviteProgress value={referral ? (referral.current / referral.required) * 100 : 0} />
                <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {referral?.current}/{referral?.required}
                </span>
              </div>
              <Button variant="outline" className="mt-2.5 h-11 w-full" onClick={share}>
                <Share2 className="h-4 w-4" /> {referral && referral.current > 0 ? "Share again" : "Share my link"}
              </Button>
            </div>
          )}

          {!isPremium && (
            <p className="flex items-center justify-center gap-1.5 px-2 text-center text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> Bank transfer or Telegram Stars — Premium unlocks as soon as your payment is approved.
            </p>
          )}
        </div>

        <div className="shrink-0 border-t border-border px-4 py-3 pb-safe">
          {isPremium ? (
            <Button className="h-12 w-full rounded-xl bg-blue-fix-600 text-base font-bold text-white" onClick={() => onOpenChange(false)}>
              <Check className="h-5 w-5" /> Keep studying
            </Button>
          ) : (
            <Button className="h-12 w-full rounded-xl bg-gradient-to-r from-yellow-fix-600 to-orange-fix-700 text-base font-extrabold text-white hover:opacity-90" onClick={pay}>
              <Sparkles className="h-5 w-5" /> Upgrade to Premium
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
