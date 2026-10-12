import { createContext, useCallback, useContext, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ConfirmDialog } from "./kit";

interface Guard {
  dirty: boolean;
  setDirty: (d: boolean) => void;
  go: (to: string) => void;
}
const Ctx = createContext<Guard>({ dirty: false, setDirty: () => undefined, go: () => undefined });
export const useNavGuard = () => useContext(Ctx);

/** Unsaved-changes guard: any in-admin navigation asks first while `dirty` is set. */
export function NavGuardProvider({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const navigate = useNavigate();
  const go = useCallback(
    (to: string) => {
      if (dirty) setPending(to);
      else navigate(to);
    },
    [dirty, navigate],
  );
  const value = useMemo(() => ({ dirty, setDirty, go }), [dirty, go]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title="Discard unsaved changes?"
        description="Your edits to this module have not been saved."
        confirmLabel="Discard"
        onConfirm={() => {
          const to = pending;
          setDirty(false);
          setPending(null);
          if (to) navigate(to);
        }}
      />
    </Ctx.Provider>
  );
}

export function GuardedLink({ to, onClick, ...rest }: ComponentProps<typeof Link> & { to: string }) {
  const { dirty, go } = useNavGuard();
  return (
    <Link
      to={to}
      onClick={(e) => {
        onClick?.(e);
        if (dirty && !e.defaultPrevented) {
          e.preventDefault();
          go(to);
        }
      }}
      {...rest}
    />
  );
}
