import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Catalog } from "./catalog";

export interface LocationValue { regionId: string; cityId: string; region: string; city: string }
export const EMPTY_LOCATION: LocationValue = { regionId: "", cityId: "", region: "", city: "" };
const OTHER = "__other__";

/** Region + city from the catalog, each with an "Other" free-text escape hatch. */
export default function LocationFields({ catalog, value, onChange }: { catalog: Catalog; value: LocationValue; onChange: (v: LocationValue) => void }) {
  const regions = catalog.locations.regions.filter((r) => r.active);
  const region = regions.find((r) => r.id === value.regionId);
  const cities = (region?.cities ?? []).filter((c) => c.active);
  const [otherRegion, setOtherRegion] = useState(false);
  const [otherCity, setOtherCity] = useState(false);
  const regionSel = otherRegion ? OTHER : value.regionId;
  const citySel = otherCity ? OTHER : value.cityId;
  const freeCity = otherRegion || otherCity || (!!value.regionId && cities.length === 0);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <label className="text-sm font-semibold">Region *</label>
        <Select
          value={regionSel}
          onValueChange={(id) => {
            setOtherCity(false);
            if (id === OTHER) { setOtherRegion(true); onChange({ regionId: "", cityId: "", region: "", city: "" }); return; }
            setOtherRegion(false);
            onChange({ regionId: id, cityId: "", region: regions.find((r) => r.id === id)?.name ?? "", city: "" });
          }}
        >
          <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Select a region" /></SelectTrigger>
          <SelectContent>
            {regions.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            <SelectItem value={OTHER}>Other…</SelectItem>
          </SelectContent>
        </Select>
        {otherRegion && <Input className="h-12 rounded-xl" placeholder="Your region" value={value.region} onChange={(e) => onChange({ ...value, region: e.target.value })} />}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold">City *</label>
        {!freeCity && (
          <Select
            value={citySel}
            disabled={!value.regionId}
            onValueChange={(id) => {
              if (id === OTHER) { setOtherCity(true); onChange({ ...value, cityId: "", city: "" }); return; }
              onChange({ ...value, cityId: id, city: cities.find((c) => c.id === id)?.name ?? "" });
            }}
          >
            <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder={value.regionId ? "Select a city" : "Pick a region first"} /></SelectTrigger>
            <SelectContent>
              {cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              <SelectItem value={OTHER}>Other…</SelectItem>
            </SelectContent>
          </Select>
        )}
        {freeCity && <Input className="h-12 rounded-xl" placeholder="Your city" value={value.city} onChange={(e) => onChange({ ...value, cityId: "", city: e.target.value })} />}
      </div>
    </div>
  );
}
