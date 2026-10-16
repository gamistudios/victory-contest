// Server-clock offset (plan §5.4): every countdown uses server time, never the
// device clock, so a wrong phone clock cannot extend or cut an attempt.
import { useCallback, useRef } from "react";

export function useServerClock() {
  const offset = useRef(0); // serverNow - deviceNow, in ms
  const sync = useCallback((serverNow?: string) => {
    const t = serverNow ? Date.parse(serverNow) : NaN;
    if (!Number.isNaN(t)) offset.current = t - Date.now();
  }, []);
  const now = useCallback(() => Date.now() + offset.current, []);
  return { sync, now };
}
