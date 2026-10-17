// Phase 4 admin shell (plan §5.8): the "Working in: <program> · <stream>" context.
// Stored in the URL (?program=&stream=) so a link keeps the scope, and mirrored to
// localStorage so it survives navigation. List pages read it through useScope().
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

export interface ProgramScope { program: string; stream: string } // "" = all
interface Ctx extends ProgramScope { setScope: (s: Partial<ProgramScope>) => void; active: boolean }

const KEY = "admin_program_scope";
const read = (): ProgramScope => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { program: v.program ?? "", stream: v.stream ?? "" };
  } catch {
    return { program: "", stream: "" };
  }
};

const ProgramCtx = createContext<Ctx>({ program: "", stream: "", active: false, setScope: () => undefined });

export function ProgramProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const stored = useMemo(read, []);
  const program = params.get("program") ?? stored.program;
  const stream = params.get("stream") ?? stored.stream;

  const setScope = useCallback((s: Partial<ProgramScope>) => {
    const next = { program, stream, ...s };
    if (s.program !== undefined && s.program !== program) next.stream = s.stream ?? ""; // a stream belongs to its program
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage may be blocked */ }
    const p = new URLSearchParams(params);
    next.program ? p.set("program", next.program) : p.delete("program");
    next.stream ? p.set("stream", next.stream) : p.delete("stream");
    setParams(p, { replace: true });
  }, [program, stream, params, setParams]);

  const value = useMemo(() => ({ program, stream, setScope, active: !!program }), [program, stream, setScope]);
  return <ProgramCtx.Provider value={value}>{children}</ProgramCtx.Provider>;
}

/** The one hook every list page uses to read the header's program/stream scope. */
export const useScope = () => useContext(ProgramCtx);
