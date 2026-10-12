import { Eye, RotateCcw, Sparkles, Type, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAcademy, type FontSize } from "../context/AcademyContext";
import { devReset } from "@/services/academy/academyApi";

const SIZES: Array<[FontSize, string]> = [["sm", "A"], ["md", "A"], ["lg", "A"], ["xl", "A"]];
const SIZE_CLS = ["text-xs", "text-sm", "text-base", "text-xl"];

export function SettingsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { prefs, setPrefs, isPremium, setPremiumPreview } = useAcademy();
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[88dvh]">
        <DrawerHeader>
          <DrawerTitle className="font-nunito text-xl">Reading & preview</DrawerTitle>
          <DrawerDescription>Personalise how lessons look.</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-5 overflow-y-auto px-4 pb-6 pb-safe">
          <section>
            <p className="mb-2 flex items-center gap-2 text-sm font-bold"><Type className="h-4 w-4" /> Text size</p>
            <div className="grid grid-cols-4 gap-2">
              {SIZES.map(([k, l], i) => (
                <button key={k} onClick={() => setPrefs({ fontSize: k })} aria-pressed={prefs.fontSize === k} aria-label={`Text size ${k}`}
                  className={cn("h-12 rounded-xl border font-bold transition", SIZE_CLS[i], prefs.fontSize === k ? "border-brand bg-brand/15 text-brand-ink" : "border-border bg-card text-muted-foreground")}>
                  {l}
                </button>
              ))}
            </div>
          </section>
          <section className="flex items-center justify-between gap-3 rounded-2xl border border-border p-3">
            <div className="flex items-center gap-3">
              <Wifi className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-bold">Data saver</p>
                <p className="text-xs text-muted-foreground">Videos load only when you press play</p>
              </div>
            </div>
            <Switch checked={prefs.dataSaver} onCheckedChange={(v) => setPrefs({ dataSaver: v })} aria-label="Data saver" />
          </section>
          <section className="rounded-2xl border border-dashed border-border p-3">
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><Eye className="h-4 w-4" /> Mock preview tools</p>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-yellow-600" />
                <p className="text-sm font-bold">View as Premium student</p>
              </div>
              <Switch checked={isPremium} onCheckedChange={(v) => setPremiumPreview(v).then(() => toast.success(v ? "Premium preview on" : "Free preview on"))} aria-label="Premium preview" />
            </div>
            <button
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-muted text-sm font-semibold"
              onClick={async () => { await devReset(); toast.success("Mock data reset"); window.location.reload(); }}
            >
              <RotateCcw className="h-4 w-4" /> Reset mock data
            </button>
          </section>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
