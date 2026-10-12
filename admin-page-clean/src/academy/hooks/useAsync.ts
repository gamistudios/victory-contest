import { useCallback, useEffect, useRef, useState } from "react";
import { isAbortedRequest } from "@/services/api";

/** Minimal data hook with the same "ignore stale / aborted responses" discipline used in victory-contest. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async (silent = false) => {
    const id = ++seq.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fnRef.current();
      if (id === seq.current) setData(res);
    } catch (e) {
      if (id !== seq.current || isAbortedRequest(e)) return;
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? (e instanceof Error ? e.message : "Something went wrong");
      setError(msg);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    run();
    return () => {
      seq.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload: () => run(), refresh: () => run(true), setData };
}
