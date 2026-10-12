import { BarChart3, BookOpen, FilePlus2, Library, Sparkles, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { adminGetAnalytics, adminGetDrafts, adminGetTree } from "@/services/academy/academyApi";
import { useAsync } from "../hooks/useAsync";
import { InlineError, CardSkeleton } from "../components/States";
import { ADMIN_BASE, Panel, PanelTitle, PageTitle, StatTile } from "./components/kit";


export default function Overview() {
  const a = useAsync(adminGetAnalytics, []);
  const d = useAsync(() => adminGetDrafts(), []);
  const t = useAsync(() => adminGetTree(), []);
  const pending = (d.data ?? []).filter((x) => x.status === "pending");
  const drafts = (t.data?.tree ?? []).flatMap((s) => s.chapters.flatMap((c) => c.modules)).filter((m) => m.publish_status !== "published");

  if (a.error) return <div className="p-4"><InlineError message={a.error} onRetry={a.reload} /></div>;

  const actions = [
    { to: `${ADMIN_BASE}/content`, label: "Course builder", icon: Library, tone: "bg-blue-100 text-blue-700" },
    { to: `${ADMIN_BASE}/ai-review`, label: `AI review${pending.length ? ` (${pending.length})` : ""}`, icon: Sparkles, tone: "bg-violet-100 text-violet-700" },
    { to: `${ADMIN_BASE}/analytics`, label: "Analytics", icon: BarChart3, tone: "bg-emerald-100 text-emerald-700" },
    { to: `${ADMIN_BASE}/access`, label: "Access", icon: Users, tone: "bg-amber-100 text-amber-700" },
  ];

  return (
    <div className="space-y-4 py-4">
      <PageTitle title="Overview" hint="Content health at a glance" />
      {a.loading || !a.data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon={Users} label="Students" value={a.data.total_enrollments.toLocaleString()} />
          <StatTile icon={Sparkles} label="Free → Premium" value={`${a.data.free_to_premium_rate}%`} tone="bg-yellow-100 text-yellow-700" />
          <StatTile icon={BookOpen} label="Published" value={`${a.data.published_modules}/${a.data.total_modules}`} tone="bg-green-100 text-green-700" />
          <StatTile icon={Library} label="Premium modules" value={a.data.premium_modules} tone="bg-violet-100 text-violet-700" />
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        {actions.map(({ to, label, icon: Icon, tone }) => (
          <Link key={to} to={to} className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card p-3 text-center transition active:scale-95">
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
            <span className="text-[11px] font-bold leading-tight">{label}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelTitle icon={Sparkles}>Waiting for review</PanelTitle>
          {pending.length === 0 ? <p className="text-sm text-muted-foreground">Nothing pending.</p> : (
            <ul className="space-y-2">
              {pending.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2 text-sm">
                  <span className="font-semibold capitalize">{p.kind.replace("_", " ")}</span>
                  <Link className="font-bold text-blue-700 underline" to={`${ADMIN_BASE}/ai-review`}>Review</Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel>
          <PanelTitle icon={FilePlus2}>Not published yet</PanelTitle>
          {drafts.length === 0 ? <p className="text-sm text-muted-foreground">Everything is live.</p> : (
            <ul className="space-y-2">
              {drafts.slice(0, 6).map((m) => (
                <li key={m.id}>
                  <Link to={`${ADMIN_BASE}/module/${m.id}`} className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate font-semibold">{m.title}</span>
                    <span className="ml-2 shrink-0 text-xs font-bold capitalize text-muted-foreground">{m.publish_status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
