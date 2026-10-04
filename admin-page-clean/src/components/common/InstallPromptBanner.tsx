import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  canInstall,
  isStandalone,
  promptInstall,
  subscribeInstallChange,
} from "@/lib/pwa";

const DISMISS_KEY = "vc-admin-install-dismissed";

export default function InstallPromptBanner() {
  const [available, setAvailable] = useState(false);

  useEffect(
    () => subscribeInstallChange(() => setAvailable(canInstall() && !isStandalone())),
    []
  );

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY) || isStandalone()) return;
    setAvailable(canInstall());
  }, []);

  if (!available) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setAvailable(false);
  };

  return (
    <div className="pointer-events-auto fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-lg border bg-background p-3 shadow-lg sm:inset-x-auto sm:right-6 sm:bottom-6">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00AB55]/10">
        <Download className="h-5 w-5 text-[#00AB55]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Install VC Admin</p>
        <p className="text-xs text-muted-foreground">
          Add this dashboard to your device for full-screen access.
        </p>
      </div>
      <Button size="sm" onClick={() => void promptInstall()}>
        Install
      </Button>
      <Button variant="ghost" size="icon" className="tight h-8 w-8" onClick={dismiss} aria-label="Dismiss install prompt">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
