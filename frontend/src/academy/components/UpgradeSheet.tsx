import { Gift, Lock, Share2, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "./ProgressRing";
import { registerReferral } from "@/services/academy/academyApi";
import { useTelegram } from "@/hooks/useTelegram";
import { useNavigate } from "react-router-dom";

export interface ReferralState {
  enabled: boolean;
  required: number;
  current: number;
  unlocked: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  moduleId?: string;
  feature?: string;
  referral?: ReferralState | null;
  onUnlocked?: () => void;
}

/** One sheet for every locked thing: upgrade CTA + optional "invite friends" unlock. */
export function UpgradeSheet({ open, onOpenChange, moduleId, feature = "this content", referral, onUnlocked }: Props) {
  const { hapticFeedback } = useTelegram();
  const navigate = useNavigate();

  const share = async () => {
    hapticFeedback("impact", "light");
    const link = `https://t.me/victory_academy_bot?start=ref_${moduleId ?? "academy"}`;
    try {
      if (navigator.share) await navigator.share({ title: "Victory Academy", text: "Study with me on Victory Academy!", url: link });
      else await navigator.clipboard?.writeText(link);
    } catch {
      /* dismissed */
    }
    // Mock: pretend a friend opened the link so the unlock flow can be demoed.
    if (moduleId && referral?.enabled) {
      try {
        const r = await registerReferral(moduleId);
        toast.success(r.unlocked ? "Unlocked! Enjoy the lesson." : `A friend joined (${r.current}/${r.required})`);
        if (r.unlocked) {
          onOpenChange(false);
          onUnlocked?.();
        } else onUnlocked?.();
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
  };

  const pct = referral ? (referral.current / referral.required) * 100 : 0;
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[88dvh]">
        <DrawerHeader>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-100 text-yellow-700">
            <Lock className="h-7 w-7" />
          </div>
          <DrawerTitle className="font-nunito text-xl">Premium content</DrawerTitle>
          <DrawerDescription>Unlock {feature} with a Premium plan{referral?.enabled ? " or by inviting friends" : ""}.</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-3 px-4 pb-6 pb-safe">
          <Button
            className="h-12 w-full bg-gradient-to-r from-yellow-fix-600 to-orange-fix-700 text-base font-bold text-white hover:opacity-90"
            onClick={() => {
              hapticFeedback("impact", "medium");
              onOpenChange(false);
              navigate("/academy/upgrade");
            }}
          >
            <Sparkles className="h-5 w-5" /> Upgrade to Premium
          </Button>

          {referral?.enabled && !referral.unlocked && (
            <div className="rounded-2xl border border-border bg-muted/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 text-green-700">
                  <Gift className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground">Invite {referral.required} friends — free unlock</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <ProgressBar value={pct} className="h-1.5 flex-1" barClass="bg-green-fix-600" />
                    <span className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {referral.current}/{referral.required}
                    </span>
                  </div>
                </div>
              </div>
              <Button variant="outline" className="mt-3 h-11 w-full" onClick={share}>
                <Share2 className="h-4 w-4" /> Share my link
              </Button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
