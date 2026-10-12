/**
 * Invite-to-unlock deep link handling.
 *
 * `t.me/<bot>?startapp=ref_<referrerId>_<moduleId>` has no page of its own:
 * Telegram opens the mini app at its configured start URL and hands the app only
 * the `start_param` string. So this module is the whole handler - parse the link,
 * land the friend on the shared lesson, count the visit for the person who shared
 * it, and say what happened.
 *
 * It lives in shared lib/ rather than academy/ because the link arrives at the
 * app level: a friend who has never registered is redirected to /register before
 * the Academy provider is ever mounted, and their invite still has to count.
 */
import { claimReferral } from "@/services/academy/academyApi";
import { ensureStudentSession } from "@/services/telegramServices";

export interface ReferralInvite {
  /** Whose link was opened - the student that gets counted closer to unlocking. */
  referrerId: string;
  /** The lesson the link was built for. */
  moduleId: string;
  /** The raw start_param, which is also the "already handled" key. */
  param: string;
}

export type ReferralOutcome =
  /** This launch already answered the link (or another effect pass owns it). */
  | { kind: "skipped" }
  /** The visit counted towards the referrer's `required` friends. */
  | { kind: "counted"; unlocked: boolean }
  /** The server refused it: own link, referral off, unknown referrer, already bound. */
  | { kind: "rejected"; message: string }
  /** Offline / 5xx / no session yet - no marker stored, so the next launch retries. */
  | { kind: "unavailable" };

const INVITE = /^ref_(\d+)_(.+)$/;
const CLAIMED_KEY = "academy_ref_claimed";

/** StrictMode remounts and re-renders share one in-flight claim per link. */
const pending = new Set<string>();

export function parseReferralParam(param?: string): ReferralInvite | null {
  const match = INVITE.exec(param ?? "");
  if (!match || !param) return null;
  return { referrerId: match[1], moduleId: match[2], param };
}

/** The invite this app launch arrived through, if any. */
export function readReferralInvite(): ReferralInvite | null {
  return parseReferralParam(window.Telegram?.WebApp?.initDataUnsafe?.start_param);
}

/** Where a friend opening the link belongs: the lesson that was shared. */
export function referralTarget(invite: ReferralInvite): string {
  return `/academy/module/${invite.moduleId}`;
}

function claimedInThisLaunch(param: string): boolean {
  try {
    return sessionStorage.getItem(CLAIMED_KEY) === param;
  } catch {
    return false; // storage blocked: the server de-duplicates anyway
  }
}

function markClaimed(param: string): void {
  try {
    sessionStorage.setItem(CLAIMED_KEY, param);
  } catch {
    /* storage blocked: the server de-duplicates anyway */
  }
}

const responseOf = (err: unknown) =>
  (err as { response?: { status?: number; data?: { error?: string } } })?.response;

/**
 * Counts this visit for the referrer, once.
 *
 * The marker that stops a relaunch from re-claiming is written only when the
 * server gives a real answer, so a dropped request or a session that was not
 * ready yet stays a retry instead of silently burning the invite.
 */
export async function claimReferralVisit(invite: ReferralInvite): Promise<ReferralOutcome> {
  if (claimedInThisLaunch(invite.param) || pending.has(invite.param)) return { kind: "skipped" };
  pending.add(invite.param);
  try {
    // POST /academy/referrals/claim is a student-auth route, and on a first
    // launch the token is still being minted: wait for it instead of sending
    // a request that can only answer 401.
    await ensureStudentSession().catch(() => undefined);
    const state = await claimReferral(invite.referrerId, invite.moduleId);
    markClaimed(invite.param);
    return { kind: "counted", unlocked: !!state?.unlocked };
  } catch (err) {
    const status = responseOf(err)?.status ?? 0;
    // A refusal (self-referral, referral unlock disabled, unknown referrer, this
    // account already counted for someone else) will not change on retry, so it
    // is final for this launch too. 401 and 429 are not: session or throttling.
    if (status >= 400 && status < 500 && status !== 401 && status !== 429) {
      markClaimed(invite.param);
      return { kind: "rejected", message: responseOf(err)?.data?.error || "This invite link can't be counted." };
    }
    return { kind: "unavailable" };
  } finally {
    pending.delete(invite.param);
  }
}

/** What the student is told about the claim; null means there is nothing to say. */
export function describeReferralOutcome(outcome: ReferralOutcome): string | null {
  switch (outcome.kind) {
    case "counted":
      return "Invite counted — this lesson opened from a friend's link.";
    case "rejected":
      return outcome.message;
    default:
      // skipped: nothing changed. unavailable: retried the next time the app opens.
      return null;
  }
}
