import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Plus, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineError } from "@/academy/components/States";
import { Field, FormSheet, PageTitle, Panel, PanelTitle, Segmented, errMsg, inputCls } from "@/academy/admin/components/kit";
import * as svc from "@/services/pricingServices";
import { getAdminCatalog } from "@/services/catalogServices";

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const NEW = "__new__";

/** Admin Locations: managed regions/cities plus a panel that promotes students' free-text entries. */
export default function Locations() {
  const [regions, setRegions] = useState<svc.Region[] | null>(null);
  const [freeText, setFreeText] = useState<svc.FreeTextLocation[]>([]);
  const [tab, setTab] = useState<"list" | "free">("list");
  const [newRegion, setNewRegion] = useState("");
  const [newCity, setNewCity] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [promoting, setPromoting] = useState<svc.FreeTextLocation | null>(null);

  const loadFree = useCallback(() => svc.getFreeTextLocations().then(setFreeText).catch(() => setFreeText([])), []);
  useEffect(() => {
    svc.getLocations().then(setRegions).catch((e) => setError(errMsg(e)));
    void loadFree();
  }, [loadFree]);

  const edit = (fn: (r: svc.Region[]) => svc.Region[]) => {
    setRegions((r) => fn(r ?? []));
    setDirty(true);
  };
  const patchRegion = (ri: number, p: Partial<svc.Region>) => edit((all) => all.map((x, i) => (i === ri ? { ...x, ...p } : x)));
  const patchCity = (ri: number, ci: number, p: Partial<svc.City>) =>
    edit((all) => all.map((x, i) => (i === ri ? { ...x, cities: x.cities.map((y, j) => (j === ci ? { ...y, ...p } : y)) } : x)));

  const save = async () => {
    if (!regions) return;
    setSaving(true);
    try {
      setRegions(await svc.saveLocations(regions));
      setDirty(false);
      void getAdminCatalog(true);
      toast.success("Locations saved. Renames are applied to existing students.");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const total = useMemo(() => freeText.reduce((n, x) => n + x.count, 0), [freeText]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4">
      <PageTitle
        title="Locations"
        hint="Regions and cities students pick at registration. Ids never change; renaming only changes the display name."
        action={
          <Button onClick={save} disabled={!dirty || saving} className="h-11 gap-1.5 rounded-xl">
            <Save className="h-4 w-4" aria-hidden /> {saving ? "Saving…" : "Save"}
          </Button>
        }
      />
      <Segmented
        label="Locations view"
        value={tab}
        onChange={setTab}
        options={[
          { value: "list", label: "Regions & cities", icon: MapPin },
          { value: "free", label: `Free-text${freeText.length ? ` (${freeText.length})` : ""}`, icon: Sparkles },
        ]}
      />
      {error && <InlineError message={error} />}

      {tab === "list" ? (
        <>
          <Panel>
            <PanelTitle icon={Plus}>Add region</PanelTitle>
            <div className="flex gap-2">
              <input className={inputCls} placeholder="Region name" value={newRegion} onChange={(e) => setNewRegion(e.target.value)} />
              <Button
                variant="secondary"
                className="h-11 rounded-xl"
                disabled={!slug(newRegion) || !!regions?.some((r) => r.id === slug(newRegion))}
                onClick={() => {
                  edit((r) => [...r, { id: slug(newRegion), name: newRegion.trim(), active: true, sort_order: r.length + 1, cities: [] }]);
                  setNewRegion("");
                }}
              >
                Add
              </Button>
            </div>
          </Panel>

          {!regions && <Skeleton className="h-40 w-full rounded-2xl" />}
          {regions?.map((r, ri) => (
            <Panel key={r.id} className={r.active ? "" : "opacity-70"}>
              <div className="flex items-center gap-3">
                <input aria-label="Region name" className={`${inputCls} font-bold`} value={r.name} onChange={(e) => patchRegion(ri, { name: e.target.value })} />
                <Switch checked={r.active} onCheckedChange={(v) => patchRegion(ri, { active: v })} aria-label={`${r.name} active`} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">id: {r.id}</p>
              <ul className="mt-3 grid gap-2 md:grid-cols-2">
                {r.cities.map((c, ci) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <input aria-label="City name" className={inputCls} value={c.name} onChange={(e) => patchCity(ri, ci, { name: e.target.value })} />
                    <Switch checked={c.active} onCheckedChange={(v) => patchCity(ri, ci, { active: v })} aria-label={`${c.name} active`} />
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <input className={inputCls} placeholder="New city" value={newCity[r.id] ?? ""} onChange={(e) => setNewCity({ ...newCity, [r.id]: e.target.value })} />
                <Button
                  variant="secondary"
                  className="h-11 rounded-xl"
                  disabled={!slug(newCity[r.id] ?? "") || r.cities.some((c) => c.id === slug(newCity[r.id] ?? ""))}
                  onClick={() => {
                    const n = (newCity[r.id] ?? "").trim();
                    patchRegion(ri, { cities: [...r.cities, { id: slug(n), name: n, active: true }] });
                    setNewCity({ ...newCity, [r.id]: "" });
                  }}
                >
                  Add city
                </Button>
              </div>
            </Panel>
          ))}
        </>
      ) : (
        <Panel>
          <PanelTitle icon={Sparkles}>Promote free-text locations</PanelTitle>
          <p className="mb-3 text-sm text-muted-foreground">
            Places students typed under “Other” ({total} students). Promote one to add it to the list above and link those students to it.
          </p>
          {freeText.length === 0 ? (
            <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">Nothing to promote. Every student uses a listed location.</p>
          ) : (
            <ul className="divide-y divide-border">
              {freeText.map((x) => (
                <li key={`${x.region_id}|${x.region}|${x.city}`} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{x.city}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {x.region || "(no region)"} · {x.count} student{x.count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Button variant="secondary" className="h-11 rounded-xl" onClick={() => setPromoting(x)}>
                    Promote
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {promoting && (
        <PromoteSheet
          item={promoting}
          regions={regions ?? []}
          onClose={() => setPromoting(null)}
          onDone={(r, updated, failed) => {
            setRegions(r);
            setPromoting(null);
            void getAdminCatalog(true);
            void loadFree();
            const people = `${updated} student${updated === 1 ? "" : "s"} updated`;
            if (failed > 0) toast.error(`${people}, ${failed} failed to save — report this.`);
            else toast.success(`Promoted. ${people}.`);
          }}
        />
      )}
    </div>
  );
}

function PromoteSheet({ item, regions, onClose, onDone }: { item: svc.FreeTextLocation; regions: svc.Region[]; onClose: () => void; onDone: (r: svc.Region[], updated: number, failed: number) => void }) {
  const known = !!item.region_id; // region already linked: only the city is free text
  const guess = regions.find((r) => r.name.trim().toLowerCase() === item.region.trim().toLowerCase())?.id;
  const [target, setTarget] = useState(item.region_id || guess || NEW);
  const [newRegion, setNewRegion] = useState(item.region);
  const [cityName, setCityName] = useState(item.city);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  const submit = async () => {
    setBusy(true);
    setErr(undefined);
    try {
      const r = await svc.promoteLocation({
        from_region_id: item.region_id,
        from_region: item.region,
        from_city: item.city,
        target_region_id: target === NEW ? "" : target,
        new_region_name: target === NEW ? newRegion : "",
        city_name: cityName,
      });
      onDone(r.regions, r.updated, r.failed ?? 0);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Promote location"
      description={`${item.count} student${item.count === 1 ? "" : "s"} typed “${item.city}”${item.region ? ` in “${item.region}”` : ""}.`}
      footer={
        <>
          <Button variant="secondary" className="h-11 flex-1 rounded-xl" onClick={onClose}>Cancel</Button>
          <Button className="h-11 flex-1 rounded-xl" disabled={busy || !cityName.trim() || (target === NEW && !newRegion.trim())} onClick={submit}>
            {busy ? "Promoting…" : "Promote"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Region" hint={known ? "Region is already linked for these students." : undefined}>
          <select className={inputCls} value={target} disabled={known} onChange={(e) => setTarget(e.target.value)}>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
            {!known && <option value={NEW}>New region…</option>}
          </select>
        </Field>
        {target === NEW && (
          <Field label="New region name">
            <input className={inputCls} value={newRegion} onChange={(e) => setNewRegion(e.target.value)} />
          </Field>
        )}
        <Field label="City display name" error={err} hint="Fix spelling here; it is also written to the students.">
          <input className={inputCls} value={cityName} onChange={(e) => setCityName(e.target.value)} />
        </Field>
      </div>
    </FormSheet>
  );
}
