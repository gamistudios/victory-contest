import { BookOpen, Bot, CalendarClock, FileText, Gift, HelpCircle, Layers, Lock, Star, Users, Video, type LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { AccessBadge } from "@/features/lectures/components/AccessBadge";
import { RESOURCE_KEYS, type Access, type ResourceKey } from "@/types/academy";
import { Field, Panel, PanelTitle, STATUS_OPTIONS, Segmented, Stepper } from "../components/kit";
import { RESOURCE_LABEL, effectiveAccess } from "./helpers";
import type { TabProps } from "./parts";

const ICON: Record<ResourceKey, LucideIcon> = { reading: BookOpen, video: Video, documents: FileText, flashcards: Layers, quiz: HelpCircle, ai_tutor: Bot };
type Choice = "inherit" | Access;

export function AccessTab({ m, set }: TabProps) {
  const setRes = (k: ResourceKey, v: Choice) => {
    const next = { ...m.resource_access };
    if (v === "inherit") delete next[k];
    else next[k] = v;
    set({ resource_access: next });
  };
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Panel className="space-y-3">
          <PanelTitle icon={Lock}>Module access</PanelTitle>
          <Segmented<Access> label="Module access" value={m.access_status} onChange={(a) => set({ access_status: a })} options={[{ value: "free", label: "Free", icon: Gift }, { value: "premium", label: "Premium", icon: Star }]} />
          <p className="text-xs text-muted-foreground">Each resource can follow the module or be set on its own.</p>
        </Panel>

        <Panel className="space-y-3">
          <PanelTitle icon={Users}>Referral unlock</PanelTitle>
          <div className="flex min-h-11 items-center justify-between gap-3">
            <label htmlFor="ref-switch" className="text-sm font-semibold">
              Free students can unlock by inviting friends
            </label>
            <Switch id="ref-switch" checked={m.referral_unlock.enabled} onCheckedChange={(enabled) => set({ referral_unlock: { ...m.referral_unlock, enabled } })} />
          </div>
          {m.referral_unlock.enabled && (
            <Field label="Friends needed">
              <Stepper label="friends needed" value={m.referral_unlock.required_referrals} min={1} max={20} onChange={(n) => set({ referral_unlock: { ...m.referral_unlock, required_referrals: n } })} />
            </Field>
          )}
        </Panel>

        <Panel className="space-y-3">
          <PanelTitle icon={CalendarClock}>Publishing</PanelTitle>
          <Segmented<typeof m.publish_status> label="Publish status" compact value={m.publish_status} onChange={(s) => set({ publish_status: s })} options={STATUS_OPTIONS} className="flex-wrap sm:flex-nowrap" />
        </Panel>
      </div>

      <Panel>
        <PanelTitle>Per resource</PanelTitle>
        <ul className="divide-y divide-border">
          {RESOURCE_KEYS.map((k) => {
            const Icon = ICON[k];
            const cur: Choice = m.resource_access[k] ?? "inherit";
            return (
              <li key={k} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground")}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="flex-1 text-sm font-bold">{RESOURCE_LABEL[k]}</span>
                  <AccessBadge access={effectiveAccess(m, k)} />
                </div>
                <Segmented<Choice> label={`${RESOURCE_LABEL[k]} access`} compact value={cur} onChange={(v) => setRes(k, v)} options={[{ value: "inherit", label: "Inherit" }, { value: "free", label: "Free" }, { value: "premium", label: "Premium" }]} />
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
