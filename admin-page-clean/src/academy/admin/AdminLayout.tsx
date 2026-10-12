import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { BarChart3, Library, LayoutDashboard, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { adminGetDrafts } from "@/services/academy/academyApi";
import { cn } from "@/lib/utils";
import { ADMIN_BASE, DRAFTS_EVENT } from "./components/kit";
import { GuardedLink, NavGuardProvider } from "./components/guard";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  match: (p: string) => boolean;
  badge?: boolean;
}

const ITEMS: NavItem[] = [
  { to: ADMIN_BASE, label: "Overview", icon: LayoutDashboard, match: (p) => p === ADMIN_BASE || p === `${ADMIN_BASE}/` },
  { to: `${ADMIN_BASE}/content`, label: "Course builder", icon: Library, match: (p) => p.startsWith(`${ADMIN_BASE}/content`) || p.startsWith(`${ADMIN_BASE}/module`) },
  { to: `${ADMIN_BASE}/ai-review`, label: "AI review", icon: Sparkles, badge: true, match: (p) => p.startsWith(`${ADMIN_BASE}/ai-review`) },
  { to: `${ADMIN_BASE}/analytics`, label: "Analytics", icon: BarChart3, match: (p) => p.startsWith(`${ADMIN_BASE}/analytics`) },
  { to: `${ADMIN_BASE}/access`, label: "Access & programs", icon: ShieldCheck, match: (p) => p.startsWith(`${ADMIN_BASE}/access`) },
];

function usePendingCount(pathname: string) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      adminGetDrafts()
        .then((d) => alive && setN(d.filter((x) => x.status === "pending").length))
        .catch(() => undefined);
    load();
    window.addEventListener(DRAFTS_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(DRAFTS_EVENT, load);
    };
  }, [pathname]);
  return n;
}

/**
 * Academy section shell. The admin app's own sidebar / app bar / mobile drawer
 * stay in charge of global navigation; this only adds an icon tab strip for the
 * five Academy areas (scrolls sideways on phones) plus the unsaved-changes guard.
 */
function Shell() {
  const { pathname } = useLocation();
  const pending = usePendingCount(pathname);
  const editing = pathname.startsWith(`${ADMIN_BASE}/module`);

  return (
    <div className="mx-auto w-full max-w-6xl pb-6 pt-3">
      {!editing && (
        <nav aria-label="Academy sections" className="sticky top-0 z-20 -mx-4 mb-4 border-b border-border bg-background/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {ITEMS.map((it) => {
              const active = it.match(pathname);
              const Icon = it.icon;
              return (
                <GuardedLink
                  key={it.to}
                  to={it.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "tight relative flex h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "border-brand font-bold text-foreground" : "border-transparent font-medium text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  <span className="whitespace-nowrap">{it.label}</span>
                  {it.badge && pending > 0 && (
                    <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-rose-fix-600 px-1.5 text-[11px] font-bold leading-5 text-white">
                      {pending > 99 ? "99+" : pending}
                      <span className="sr-only"> pending drafts</span>
                    </span>
                  )}
                </GuardedLink>
              );
            })}
          </div>
        </nav>
      )}
      <Outlet />
    </div>
  );
}

export default function AdminLayout() {
  return (
    <NavGuardProvider>
      <Shell />
    </NavGuardProvider>
  );
}
