import { useEffect, useRef } from "react";
import { useTelegram } from "./useTelegram";

export const useScreenshotProtection = () => {
  const { hapticFeedback } = useTelegram();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const isShowingWarning = useRef(false);
  const lastVisibilityChange = useRef(0);
  const suspiciousActivityCount = useRef(0);

  useEffect(() => {
    const createOverlay = (message = "Screenshots are not allowed") => {
      if (overlayRef.current || isShowingWarning.current) return;

      isShowingWarning.current = true;
      const overlay = document.createElement("div");
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.9);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 18px;
        font-weight: bold;
        text-align: center;
        backdrop-filter: blur(20px);
        pointer-events: none;
      `;
      overlay.innerHTML = `
        <div>
          <div style="font-size: 48px; margin-bottom: 16px;">🚫</div>
          <div>${message}</div>
          <div style="font-size: 14px; margin-top: 8px; opacity: 0.8;">Contest content is protected</div>
        </div>
      `;
      document.body.appendChild(overlay);
      overlayRef.current = overlay;

      // Auto-remove after 3 seconds
      setTimeout(removeOverlay, 3000);
    };

    const removeOverlay = () => {
      if (overlayRef.current) {
        document.body.removeChild(overlayRef.current);
        overlayRef.current = null;
        isShowingWarning.current = false;
      }
    };

    const preventScreenshotShortcuts = (e: KeyboardEvent) => {
      // 1. Correct the key value here
      const forbiddenCombinations = [
        { key: "PrintScreen" },
        { ctrl: true, shift: true, key: "S" },
        { meta: true, shift: true, key: "3" },
        { meta: true, shift: true, key: "4" },
        { meta: true, shift: true, key: "5" },
      ];

      for (const combo of forbiddenCombinations) {
        let matches = true;

        // These checks are sufficient now
        if (combo.ctrl && !e.ctrlKey) matches = false;
        if (combo.shift && !e.shiftKey) matches = false;
        if (combo.meta && !e.metaKey) matches = false;
        if (combo.key && e.key !== combo.key) matches = false;

        // 2. The redundant 'if' statement has been removed

        if (matches) {
          e.preventDefault();
          createOverlay("Desktop screenshots are blocked");
          if (hapticFeedback) {
            hapticFeedback("notification", "error");
          }
          return false;
        }
      }
    };

    // Mobile screenshot detection
    const detectMobileScreenshot = () => {
      const now = Date.now();

      // Detect rapid visibility changes (common during mobile screenshots)
      if (now - lastVisibilityChange.current < 1000) {
        suspiciousActivityCount.current++;

        if (suspiciousActivityCount.current >= 2) {
          createOverlay("Mobile screenshots detected");
          if (hapticFeedback) {
            hapticFeedback("notification", "warning");
          }
          suspiciousActivityCount.current = 0;
        }
      } else {
        suspiciousActivityCount.current = 0;
      }

      lastVisibilityChange.current = now;
    };

    // Mobile-specific detection methods
    const handleVisibilityChange = () => {
      if (document.hidden) {
        detectMobileScreenshot();
      }
    };

    // Detect power button + volume down (Android screenshot)
    const handleKeyDown = (e: KeyboardEvent) => {
      // Volume keys detection (limited browser support)
      if (e.key === "VolumeDown" || e.key === "VolumeUp") {
        setTimeout(() => {
          if (document.hidden) {
            createOverlay("Screenshot attempt detected");
            if (hapticFeedback) {
              hapticFeedback("notification", "error");
            }
          }
        }, 100);
      }
    };

    // Detect three-finger screenshot (iOS)
    let touchCount = 0;
    const handleTouchStart = (e: TouchEvent) => {
      touchCount = e.touches.length;

      // Three finger touch (iOS screenshot gesture)
      if (touchCount === 3) {
        setTimeout(() => {
          createOverlay("Three-finger screenshot blocked");
          if (hapticFeedback) {
            hapticFeedback("notification", "error");
          }
        }, 100);
      }
    };

    // Detect long press (Android screenshot in some devices)
    let longPressTimer: NodeJS.Timeout;
    const handleTouchStartLongPress = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        longPressTimer = setTimeout(() => {
          // Check if still touching and app becomes hidden
          if (document.hidden) {
            createOverlay("Long press screenshot detected");
            if (hapticFeedback) {
              hapticFeedback("notification", "warning");
            }
          }
        }, 1000);
      }
    };

    const handleTouchEnd = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
      }
    };

    // Prevent right-click context menu
    const preventContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      createOverlay("Context menu blocked");
      if (hapticFeedback) {
        hapticFeedback("impact", "medium");
      }
      return false;
    };

    // Detect screen recording (limited support)
    const detectScreenRecording = () => {
      if (
        "mediaDevices" in navigator &&
        "getDisplayMedia" in navigator.mediaDevices
      ) {
        const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia;
        navigator.mediaDevices.getDisplayMedia = function (...args) {
          createOverlay("Screen recording is not allowed");
          if (hapticFeedback) {
            hapticFeedback("notification", "error");
          }
          return Promise.reject(new Error("Screen recording blocked"));
        };
      }
    };

    // Add event listeners
    document.addEventListener("contextmenu", preventContextMenu);
    document.addEventListener("keydown", preventScreenshotShortcuts);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    document.addEventListener("touchstart", handleTouchStartLongPress, {
      passive: true,
    });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    // Initialize screen recording detection
    detectScreenRecording();

    // Mobile-specific CSS protection
    const style = document.createElement("style");
    style.textContent = `
      * {
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
        -webkit-touch-callout: none;
        -webkit-tap-highlight-color: transparent;
        -webkit-user-drag: none;
        -khtml-user-drag: none;
        -moz-user-drag: none;
        -o-user-drag: none;
        user-drag: none;
      }
      
      input, textarea, button {
        -webkit-user-select: auto;
        -moz-user-select: auto;
        -ms-user-select: auto;
        user-select: auto;
      }
      
      @media print {
        body { display: none !important; }
      }
      
      /* Prevent screenshot on iOS Safari */
      @media screen and (-webkit-min-device-pixel-ratio: 0) {
        body {
          -webkit-user-select: none;
          -webkit-touch-callout: none;
        }
      }
      
      /* Android specific */
      @media screen and (max-width: 768px) {
        * {
          -webkit-user-select: none !important;
          -moz-user-select: none !important;
          -ms-user-select: none !important;
          user-select: none !important;
        }
      }
    `;
    document.head.appendChild(style);

    // Cleanup function
    return () => {
      document.removeEventListener("contextmenu", preventContextMenu);
      document.removeEventListener("keydown", preventScreenshotShortcuts);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchstart", handleTouchStartLongPress);
      document.removeEventListener("touchend", handleTouchEnd);

      removeOverlay();

      if (longPressTimer) {
        clearTimeout(longPressTimer);
      }

      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    };
  }, [hapticFeedback]);

  return {
    isProtected: true,
  };
};
