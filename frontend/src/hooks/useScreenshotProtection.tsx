import { useCallback, useEffect, useRef, useState } from "react";
import { useTelegram } from "./useTelegram";

// How long the dark "screenshot shortcut" warning stays on screen.
const SHORTCUT_WARNING_MS = 3000;

// Key combos that commonly start an OS/browser screenshot capture. These
// cannot truly block OS-level capture, but intercepting them is a deterrent
// signal during the exam (desktop Telegram webviews do receive keydown).
const FORBIDDEN_SHORTCUTS: Array<{
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
}> = [
  { key: "PrintScreen" },
  { ctrl: true, shift: true, key: "S" },
  { meta: true, shift: true, key: "3" },
  { meta: true, shift: true, key: "4" },
  { meta: true, shift: true, key: "5" },
];

export interface ScreenshotProtectionState {
  /** How many times the student switched away from the page. */
  tabSwitches: number;
  /** True while the dismiss-by-tap cover should be shown on return. */
  isCoverVisible: boolean;
  /** True while the dark screenshot-shortcut warning should be shown. */
  isShortcutWarningVisible: boolean;
  /** Acknowledge the tab-switch cover and resume the exam. */
  acknowledgeCover: () => void;
}

interface Options {
  /** Attach listeners only while the protection is actually needed. */
  enabled?: boolean;
}

export const useScreenshotProtection = ({
  enabled = true,
}: Options = {}): ScreenshotProtectionState => {
  const { hapticFeedback } = useTelegram();
  const [tabSwitches, setTabSwitches] = useState(0);
  const [isCoverVisible, setCoverVisible] = useState(false);
  const [isShortcutWarningVisible, setShortcutWarningVisible] = useState(false);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when the page goes hidden during an enabled session; on return we
  // show the cover so the student must acknowledge the switch.
  const wentHiddenRef = useRef(false);

  const acknowledgeCover = useCallback(() => {
    setCoverVisible(false);
    wentHiddenRef.current = false;
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Leaving the exam window: drop any pending protection UI.
      setCoverVisible(false);
      setShortcutWarningVisible(false);
      wentHiddenRef.current = false;
      return;
    }

    const showShortcutWarning = () => {
      setShortcutWarningVisible(true);
      if (warningTimerRef.current) {
        clearTimeout(warningTimerRef.current);
      }
      warningTimerRef.current = setTimeout(() => {
        setShortcutWarningVisible(false);
        warningTimerRef.current = null;
      }, SHORTCUT_WARNING_MS);
      hapticFeedback("notification", "error");
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      for (const combo of FORBIDDEN_SHORTCUTS) {
        const matches =
          e.key === combo.key &&
          (!combo.ctrl || e.ctrlKey) &&
          (!combo.shift || e.shiftKey) &&
          (!combo.meta || e.metaKey);
        if (matches) {
          e.preventDefault();
          showShortcutWarning();
          return;
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        wentHiddenRef.current = true;
        setTabSwitches((count) => count + 1);
      } else if (wentHiddenRef.current) {
        // Back on the exam: cover the content until it is acknowledged.
        setCoverVisible(true);
        hapticFeedback("notification", "warning");
      }
    };

    // Silence the right-click/long-press context menu during the exam
    // (no overlay; preventDefault alone is the deterrent).
    const preventContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Printing the exam page produces a blank sheet while mounted.
    const printStyle = document.createElement("style");
    printStyle.textContent = `@media print { body { display: none !important; } }`;
    document.head.appendChild(printStyle);

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("contextmenu", preventContextMenu);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("contextmenu", preventContextMenu);
      if (warningTimerRef.current) {
        clearTimeout(warningTimerRef.current);
        warningTimerRef.current = null;
      }
      if (printStyle.parentNode) {
        printStyle.parentNode.removeChild(printStyle);
      }
    };
  }, [enabled, hapticFeedback]);

  return { tabSwitches, isCoverVisible, isShortcutWarningVisible, acknowledgeCover };
};
