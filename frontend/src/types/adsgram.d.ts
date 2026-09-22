export interface ShowPromiseResult {
  error: boolean;
  done: boolean;
  state: "load" | "show" | "close" | "error";
  description: string;
}

export interface AdController {
  show: () => Promise<void>;
}

interface AdsgramInitOptions {
  blockId: string;
  debug?: boolean;
  debugBannerType?: "Banner" | "FullscreenMedia" | "Video";
}

declare global {
  interface Window {
    Adsgram?: {
      init: (options: AdsgramInitOptions) => AdController;
    };
  }
}
