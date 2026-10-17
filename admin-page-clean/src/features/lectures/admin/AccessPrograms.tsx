import { useMemo, useState } from "react";
import { Gift, Star } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineError } from "@/features/lectures/components/States";
import { useAsync } from "@/features/lectures/hooks/useAsync";
import { iconFor } from "@/features/lectures/lib/theme";
import { adminGetTree, adminSetProgramActive } from "@/services/academy/academyApi";
import type { LevelId, Program } from "@/types/academy";
import { PageTitle, Panel, errMsg } from "./components/kit";

export default function AccessPrograms() {
  const { data, loading, error, reload, setData } = useAsync(adminGetTree, []);
  const [busy, setBusy] = useState<string | null>(null);

  const coverage = useMemo(() => {
    const m = new Map<LevelId, { free: number; premium: number }>();
    for (const s of data?.tree ?? [])
      for (const c of s.chapters)
        for (const mod of c.modules) {
          const cur = m.get(s.level_id) ?? { free: 0, premium: 0 };
          cur[mod.access_status] += 1;
          m.set(s.level_id, cur);
        }
    return m;
  }, [data]);

  const toggle = async (p: Program, v: boolean) => {
    if (!data) return;
    setBusy(p.id);
    const set = (active: boolean) => setData({ ...data, programs: data.programs.map((x) => (x.id === p.id ? { ...x, is_active: active } : x)) });
    set(v);
    try {
      await adminSetProgramActive(p.id, v);
      toast.success(`${p.name} ${v ? "is live" : "hidden from students"}`);
    } catch (e) {
      set(!v);
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data)
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading programs">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  if (error || !data) return <InlineError message={error} onRetry={reload} />;

  return (
    <div>
      <PageTitle title="Access & programs" hint="What is live, and how much is free" />
      <ul className="grid items-start gap-3 lg:grid-cols-2">
        {data.programs.map((p) => {
          const Icon = iconFor(p.icon_name);
          const c = coverage.get(p.id) ?? { free: 0, premium: 0 };
          const total = c.free + c.premium;
          const freePct = total ? Math.round((c.free / total) * 100) : 0;
          return (
            <li key={p.id}>
              <Panel className={p.is_active ? "" : "opacity-80"}>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {total} module{total === 1 ? "" : "s"} · {p.is_active ? "Live" : "Hidden"}
                    </p>
                  </div>
                  <div className="flex min-h-11 min-w-11 items-center justify-center">
                    <Switch checked={p.is_active} disabled={busy === p.id} onCheckedChange={(v) => toggle(p, v)} aria-label={`${p.name} active`} />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${c.free} free and ${c.premium} premium modules, ${freePct}% free`}>
                    <div className="bg-green-fix-600" style={{ width: `${freePct}%` }} />
                    <div className="bg-yellow-fix-600" style={{ width: total ? `${100 - freePct}%` : 0 }} />
                  </div>
                  <div className="mt-1.5 flex justify-between text-xs font-semibold">
                    <span className="inline-flex items-center gap-1 text-green-800">
                      <Gift className="h-3.5 w-3.5" aria-hidden /> Free {c.free} ({freePct}%)
                    </span>
                    <span className="inline-flex items-center gap-1 text-yellow-800">
                      <Star className="h-3.5 w-3.5" aria-hidden /> Premium {c.premium}
                    </span>
                  </div>
                </div>
              </Panel>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
