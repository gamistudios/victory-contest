import { useCallback, useEffect, useMemo, useState } from "react";
import { GitMerge, MapPin, Plus, Save, Sparkles } from "lucide-react";
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
  const [removing, setRemoving] = useState<svc.RemoveTarget | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const loadFree = useCallback(() => svc.getFreeTextLocations().then(setFreeText).catch(() => setFreeText([])), []);
  // Removing students from an entry changes its count, and counts come from the
  // list endpoint, so they are refreshed on their own without touching the draft.
  const loadCounts = useCallback(() => svc.getLocations().then((r) => setCounts(r.counts)).catch(() => setCounts({})), []);
  useEffect(() => {
    svc
      .getLocations()
      .then((r) => {
        setRegions(r.regions);
        setCounts(r.counts);
      })
      .catch((e) => setError(errMsg(e)));
    void loadFree();
  }, [loadFree, loadCounts]);

  // A promote or a removal writes the stored list and returns it, so the draft on
  // screen is replaced by what the server now holds.
  const adopt = (r: svc.Region[]) => {
    setRegions(r);
    setDirty(false);
    void getAdminCatalog(true);
    void loadFree();
    void loadCounts();
  };

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
        hint="Regions and cities students pick at registration. Ids never change; renaming only changes the display name. Removing an entry is its own action, so the students on it are moved or unlinked rather than orphaned."
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 shrink-0 rounded-xl"
                  disabled={dirty}
                  title={dirty ? "Save your edits first" : `Merge or remove ${r.name}`}
                  aria-label={`Merge or remove ${r.name}`}
                  onClick={() => setRemoving({ kind: "region", id: r.id, name: r.name })}
                >
                  <GitMerge className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">id: {r.id}</p>
              <ul className="mt-3 grid gap-2 md:grid-cols-2">
                {r.cities.map((c, ci) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <input aria-label="City name" className={inputCls} value={c.name} onChange={(e) => patchCity(ri, ci, { name: e.target.value })} />
                    <Switch checked={c.active} onCheckedChange={(v) => patchCity(ri, ci, { active: v })} aria-label={`${c.name} active`} />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 shrink-0 rounded-xl"
                      disabled={dirty}
                      title={dirty ? "Save your edits first" : `Merge, unlink or delete ${c.name}`}
                      aria-label={`Merge, unlink or delete ${c.name}`}
                      onClick={() => setRemoving({ kind: "city", id: c.id, name: c.name })}
                    >
                      <GitMerge className="h-4 w-4" aria-hidden />
                    </Button>
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
            Places students typed under “Other” ({total} students), grouped by the city they mean — spellings of one place are one row. Promoting
            links those students to the list; a name the list already holds joins that city instead of adding a second entry.
          </p>
          {freeText.length === 0 ? (
            <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">Nothing to promote. Every student uses a listed location.</p>
          ) : (
            <ul className="divide-y divide-border">
              {freeText.map((x) => (
                <li key={x.key} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{x.city}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {x.known ? `listed · ${x.region}` : x.region || "(no region)"} · {x.count} student{x.count === 1 ? "" : "s"}
                      {x.variants?.length ? ` · also typed “${x.variants.join("”, “")}”` : ""}
                    </p>
                  </div>
                  <Button variant="secondary" className="h-11 rounded-xl" onClick={() => setPromoting(x)}>
                    {x.known ? "Link" : "Promote"}
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
          onDone={(res) => {
            adopt(res.regions);
            setPromoting(null);
            const people = `${res.updated} student${res.updated === 1 ? "" : "s"}`;
            const where = res.target ? `${res.target.city} · ${res.target.region}` : "";
            if (res.failed > 0) {
              toast.error(`${people} updated, ${res.failed} failed to save — report this.`);
            } else if (res.target?.merged) {
              toast.success(`Merged into ${where}. ${people} linked.`);
            } else {
              toast.success(`Added ${where}. ${people} linked.`);
            }
          }}
        />
      )}

      {removing && regions && (
        <RemoveSheet
          target={removing}
          regions={regions}
          students={counts[`${removing.kind}:${removing.id}`] ?? 0}
          onClose={() => setRemoving(null)}
          onDone={(res) => {
            adopt(res.regions);
            setRemoving(null);
            const people = `${res.moved + res.unlinked} student${res.moved + res.unlinked === 1 ? "" : "s"}`;
            if (res.failed > 0) {
              toast.error(`${res.dropped} removed, ${res.failed} student write${res.failed === 1 ? "" : "s"} failed — report this.`);
            } else if (res.target) {
              const where = res.target.city ? `${res.target.city} · ${res.target.region}` : res.target.region;
              toast.success(res.moved > 0 ? `${res.dropped} merged into ${where}. ${people} moved.` : `${res.dropped} merged into ${where}. It had no students.`);
            } else if (res.unlinked > 0) {
              toast.success(`${res.dropped} removed. ${people} ${res.unlinked === 1 ? "is" : "are"} back in free text for you to promote.`);
            } else {
              toast.success(`${res.dropped} deleted. Nothing was on it.`);
            }
          }}
        />
      )}
    </div>
  );
}

function PromoteSheet({ item, regions, onClose, onDone }: {
  item: svc.FreeTextLocation;
  regions: svc.Region[];
  onClose: () => void;
  onDone: (res: Awaited<ReturnType<typeof svc.promoteLocation>>) => void;
}) {
  // The typed name is a city the list already holds: that entry decides the region,
  // so the admin links the students instead of adding a place they just spelled.
  const listed = !!item.city_id;
  // A region on the cluster only means its typed name matched a listed one — after
  // an unlink the students carry no link at all — so it pre-fills the choice
  // instead of locking it.
  const fromTypedRegion = !listed && !!item.region_id;
  const locked = listed;
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
      onDone(await svc.promoteLocation({
        group_key: item.key,
        target_region_id: target === NEW ? "" : target,
        new_region_name: target === NEW ? newRegion : "",
        city_name: cityName,
      }));
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
      title={listed ? "Link free-text students" : "Promote location"}
      description={`${item.count} student${item.count === 1 ? "" : "s"} typed “${item.city}”${
        item.variants?.length ? ` (also “${item.variants.join("”, “")}”)` : ""
      }${item.region ? ` in “${item.region}”` : ""}. Every spelling in this row is promoted together.`}
      footer={
        <>
          <Button variant="secondary" className="h-11 flex-1 rounded-xl" onClick={onClose}>Cancel</Button>
          <Button className="h-11 flex-1 rounded-xl" disabled={busy || !cityName.trim() || (target === NEW && !newRegion.trim())} onClick={submit}>
            {busy ? "Saving…" : listed ? "Link students" : "Promote"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Region"
          hint={listed ? `Joined to the listed ${item.city}, which lives in ${item.region}.` : fromTypedRegion ? `Pre-filled from the region these students typed. Change it if they belong elsewhere.` : undefined}
        >
          <select className={inputCls} value={target} disabled={locked} onChange={(e) => setTarget(e.target.value)}>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
            {!locked && <option value={NEW}>New region…</option>}
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

/** Merge one listed city into another: the entry leaves the list and its students move. */
const UNLINK = "__unlink__";

/**
 * One decision per entry that leaves the list: where its students go. Merging is
 * the default when anybody is registered, because unlinking leaves them with a
 * typed name and no link until the admin promotes them again.
 */
function RemoveSheet({ target, regions, students, onClose, onDone }: {
  target: svc.RemoveTarget;
  regions: svc.Region[];
  students: number;
  onClose: () => void;
  onDone: (res: svc.RemoveResult) => void;
}) {
  const choices = target.kind === "region"
    ? regions.filter((r) => r.id !== target.id).map((r) => ({ value: r.id, label: r.name, note: r.cities.length === 1 ? "1 city" : `${r.cities.length} cities` }))
    : regions.flatMap((r) => r.cities.filter((c) => c.id !== target.id).map((c) => ({ value: c.id, label: c.name, note: r.name })));
  const [pick, setPick] = useState(choices.length && students > 0 ? choices[0].value : UNLINK);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const merging = pick !== UNLINK;
  const where = choices.find((c) => c.value === pick)?.label ?? "";
  const noun = target.kind === "region" ? "region" : "city";

  const submit = async () => {
    setBusy(true);
    setErr(undefined);
    try {
      onDone(await svc.removeLocation({ kind: target.kind, source_id: target.id, target_id: merging ? pick : "" }));
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
      title={merging ? `Merge ${target.name}` : `${students > 0 ? "Remove" : "Delete"} ${target.name}`}
      description={
        target.kind === "region"
          ? `“${target.name}” leaves the list${students > 0 ? ` with ${students} student${students === 1 ? "" : "s"} on it` : ""}. Its cities go wherever you send its students.`
          : `“${target.name}” leaves the list${students > 0 ? ` with ${students} student${students === 1 ? "" : "s"} on it` : ""}.`
      }
      footer={
        <>
          <Button variant="secondary" className="h-11 flex-1 rounded-xl" onClick={onClose}>Cancel</Button>
          <Button
            className="h-11 flex-1 rounded-xl"
            variant={merging ? "default" : "destructive"}
            disabled={busy || (merging && !pick)}
            onClick={submit}
          >
            {busy ? "Working…" : merging ? `Merge into ${where}` : students > 0 ? "Unlink students" : "Delete"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={`Send the ${target.name} ${noun} to`} error={err}>
          <select className={inputCls} value={pick} onChange={(e) => setPick(e.target.value)}>
            {choices.map((c) => (
              <option key={`${c.value}`} value={c.value}>{c.label} — {c.note}</option>
            ))}
            <option value={UNLINK}>{students > 0 ? `Unlink: keep their typed names, ${students} student${students === 1 ? "" : "s"} back to free text` : "Delete it (no students are on it)"}</option>
          </select>
        </Field>
        <p className="text-xs text-muted-foreground">
          {merging
            ? target.kind === "region"
              ? "A city the target already holds is folded into it, so nothing appears twice."
              : "For places one spelling rule cannot decide — a neighbourhood, or the same city under two regions."
            : students > 0
              ? "Unlinked students show up under Free-text, where you can link or promote them again."
              : "Nothing to move: this entry is simply removed."}
        </p>
      </div>
    </FormSheet>
  );
}
