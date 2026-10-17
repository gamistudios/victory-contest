// Phase 4 (plan 7.3): admin routes live under /dashboard/<group>/<page>. The old flat
// paths (/dashboard/contest, /dashboard/user/:id ...) still work: LegacyRedirect sends them
// to the grouped path and keeps the rest of the URL (params, query, hash).
import { Navigate, useLocation } from "react-router-dom";

/** Old top-level segment (or two-segment path) -> grouped path below /dashboard/. */
export const GROUPED: Record<string, string> = {
  academy: "programs/academy",
  contest: "assessments/contest",
  addcontest: "assessments/addcontest",
  leaderboards: "assessments/leaderboards",
  questions: "bank/questions",
  addquestion: "bank/addquestion",
  "question-bank": "bank/question-bank",
  users: "people/users",
  user: "people/user",
  enrolment: "people/enrolment",
  admins: "people/admins",
  payment: "money/payment",
  pricing: "money/pricing",
  "settings/payment": "money/settings/payment",
  feedback: "insights/feedback",
  "high-scorers": "insights/high-scorers",
  articles: "engage/articles",
  ai: "system/ai",
  locations: "system/locations",
};

const BASE = "/dashboard";

/** "/dashboard/contest/abc" -> "/dashboard/assessments/contest/abc"; other paths come back unchanged. */
export function groupedPath(path: string): string {
  if (!path.startsWith(BASE + "/")) return path;
  const rest = path.slice(BASE.length + 1);
  const key = Object.keys(GROUPED)
    .filter((k) => rest === k || rest.startsWith(k + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return key ? `${BASE}/${GROUPED[key]}${rest.slice(key.length)}` : path;
}

export function LegacyRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={groupedPath(pathname) + search + hash} replace />;
}
