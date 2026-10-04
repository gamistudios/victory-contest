// Chrome fires beforeinstallprompt only during page load, so the listener is
// registered once at module init (from main.tsx) and the event is stashed.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((cb) => cb());

// Keep deployed sessions on the current bundle. The generated worker uses
// skipWaiting + clientsClaim, so a newly deployed worker activates as soon as
// it installs; the two halves below make the RUNNING page notice that:
//   1. reload once when a new worker takes control (otherwise the tab keeps
//      running the old bundle until a manual refresh), and
//   2. probe /admin/sw.js for updates on a timer and when the tab becomes
//      visible — the default check only runs once per full page load, so a
//      long-lived SPA session never saw deploys otherwise.
export function initPwaUpdate(): void {
  if (!("serviceWorker" in navigator)) return;

  let refreshing = false;
  const hadControllerAtLoad = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // First-ever activation has nothing stale to refresh; only a swap from a
    // previous worker means the page is running an outdated bundle.
    if (!hadControllerAtLoad || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  const checkForUpdate = () => {
    navigator.serviceWorker.getRegistration("/admin/").then((reg) => {
      reg?.update().catch(() => {});
    });
  };
  // The worker writes new precache revisions only while the page fetches
  // sw.js; probing periodically bounds how stale a session can get.
  setInterval(checkForUpdate, 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate();
  });
}

export function initPwaInstall(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

export function canInstall(): boolean {
  return deferredPrompt !== null;
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export async function promptInstall(): Promise<
  "accepted" | "dismissed" | "unavailable"
> {
  if (!deferredPrompt) return "unavailable";
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === "accepted") deferredPrompt = null;
  notify();
  return outcome;
}

export function subscribeInstallChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
