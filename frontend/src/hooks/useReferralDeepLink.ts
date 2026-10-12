import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  claimReferralVisit,
  describeReferralOutcome,
  readReferralInvite,
  referralTarget,
  type ReferralInvite,
  type ReferralOutcome,
} from "@/lib/referral";

interface State {
  /** This launch has a student record, so Academy screens can actually be shown. */
  registered: boolean;
  /** AuthProvider is past its loader, so the routed layout (and the Toaster) exists. */
  settled: boolean;
}

/**
 * Handles the invite-to-unlock deep link (`t.me/<bot>?startapp=ref_<id>_<module>`).
 *
 * Called from AuthProvider rather than an Academy screen because a friend arriving
 * through that link usually has no account yet: the provider replaces its children
 * with the /register redirect in that case, which unmounts every Academy surface
 * before the visit is ever recorded. Beside the routed content the count the sharer
 * is paid in survives registration, and the lesson opens once it can be shown.
 */
export function useReferralDeepLink({ registered, settled }: State): void {
  const navigate = useNavigate();
  const location = useLocation();
  // Either this launch came from an invite or it did not; it cannot change later.
  const inviteRef = useRef<ReferralInvite | null>(readReferralInvite());
  const outcomeRef = useRef<ReferralOutcome | null>(null);
  const claimedRef = useRef(false);
  const announcedRef = useRef(false);
  const landedRef = useRef(false);
  // The claim resolves long after the render that started it, and the mount effect
  // keeps that first render's closure: reading `settled` from it would see the
  // loader forever, so the live value is mirrored into a ref.
  const settledRef = useRef(settled);
  settledRef.current = settled;

  // The only <Toaster> lives in the routed layout, so an answer that arrives while
  // AuthProvider still shows its loader would be silently dropped: hold it until
  // the content exists and say it then.
  const announce = () => {
    const outcome = outcomeRef.current;
    if (!outcome || announcedRef.current || !settledRef.current) return;
    announcedRef.current = true;
    const message = describeReferralOutcome(outcome);
    if (!message) return;
    if (outcome.kind === "rejected") toast.error(message);
    else toast.success(message);
  };

  // Counted once per launch, whatever this screen ends up rendering. The library
  // waits for the student session, de-duplicates StrictMode's second pass, and
  // leaves a transient failure unmarked so the next launch can retry.
  useEffect(() => {
    const invite = inviteRef.current;
    if (!invite || claimedRef.current) return;
    claimedRef.current = true;
    claimReferralVisit(invite).then((outcome) => {
      outcomeRef.current = outcome;
      announce();
    });
  }, []);

  useEffect(() => {
    announce();
  }, [settled]);

  // Landing waits for a student record instead of fighting the redirect: once the
  // friend is registered, /register sends them home and this takes them to the
  // lesson they were actually invited to.
  useEffect(() => {
    const invite = inviteRef.current;
    if (!invite || landedRef.current || !registered) return;
    if (location.pathname === "/register") return;
    const target = referralTarget(invite);
    landedRef.current = true;
    if (location.pathname !== target) navigate(target, { replace: true });
  }, [registered, location.pathname, navigate]);
}
