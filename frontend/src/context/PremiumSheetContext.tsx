import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { PremiumSheet } from "@/components/PremiumSheet";
import type { PremiumSubject } from "@/lib/premium";
import { useAuth } from "./AuthContext";

interface Ctx {
  /** Open the app-wide premium sheet naming `subject` as the blocked thing. */
  open: (subject: PremiumSubject, programId?: string) => void;
}

const PremiumSheetContext = createContext<Ctx | null>(null);

/**
 * One premium sheet for the whole contest app: locked affordances call
 * usePremiumSheet().open("ai_practice") instead of each keeping its own drawer,
 * toast or bare navigate("/payment"). Academy lessons use the UpgradeSheet
 * adapter, which adds their invite-to-unlock path.
 */
export function PremiumSheetProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [subject, setSubject] = useState<PremiumSubject | null>(null);
  const [programId, setProgramId] = useState<string | undefined>(undefined);

  const open = useCallback((s: PremiumSubject, pid?: string) => { setProgramId(pid || undefined); setSubject(s); }, []);
  const close = useCallback(() => setSubject(null), []);
  const value = useMemo(() => ({ open }), [open]);

  return (
    <PremiumSheetContext.Provider value={value}>
      {children}
      <PremiumSheet
        open={subject !== null}
        onOpenChange={(o) => { if (!o) close(); }}
        subject={subject ?? "plan"}
        isPremium={!!user?.is_premium}
        programId={programId}
      />
    </PremiumSheetContext.Provider>
  );
}

export function usePremiumSheet(): Ctx {
  const ctx = useContext(PremiumSheetContext);
  if (!ctx) throw new Error("usePremiumSheet must be used inside <PremiumSheetProvider>");
  return ctx;
}
