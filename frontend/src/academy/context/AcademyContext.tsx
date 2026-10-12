import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AcademyStudent } from "@/types/academy";
import { devSetPremium, getMe } from "@/services/academy/academyApi";

/** Reader preferences (font size, data saver) — persisted per device like the contest theme. */
export type FontSize = "sm" | "md" | "lg" | "xl";
const FONT_SCALE: Record<FontSize, number> = { sm: 0.9, md: 1, lg: 1.12, xl: 1.28 };
const PREF_KEY = "academy_prefs";

interface Prefs {
  fontSize: FontSize;
  dataSaver: boolean;
}

interface Ctx {
  student: AcademyStudent | null;
  loading: boolean;
  isPremium: boolean;
  setStudent: (s: AcademyStudent) => void;
  refreshStudent: () => Promise<void>;
  /** Mock-only preview switch. */
  setPremiumPreview: (v: boolean) => Promise<void>;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
}

const AcademyContext = createContext<Ctx | undefined>(undefined);

function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) return { fontSize: "md", dataSaver: false, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { fontSize: "md", dataSaver: false };
}

export function AcademyProvider({ children }: { children: ReactNode }) {
  const [student, setStudent] = useState<AcademyStudent | null>(null);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefsState] = useState<Prefs>(readPrefs);

  const refreshStudent = useCallback(async () => {
    try {
      setStudent(await getMe());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStudent();
  }, [refreshStudent]);

  useEffect(() => {
    document.documentElement.style.setProperty("--reader-scale", String(FONT_SCALE[prefs.fontSize]));
  }, [prefs.fontSize]);

  const setPrefs = useCallback((p: Partial<Prefs>) => {
    setPrefsState((cur) => {
      const next = { ...cur, ...p };
      try {
        localStorage.setItem(PREF_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const setPremiumPreview = useCallback(async (v: boolean) => {
    setStudent(await devSetPremium(v));
  }, []);

  const value = useMemo<Ctx>(
    () => ({ student, loading, isPremium: !!student?.is_premium, setStudent, refreshStudent, setPremiumPreview, prefs, setPrefs }),
    [student, loading, refreshStudent, setPremiumPreview, prefs, setPrefs],
  );
  return <AcademyContext.Provider value={value}>{children}</AcademyContext.Provider>;
}

export function useAcademy() {
  const ctx = useContext(AcademyContext);
  if (!ctx) throw new Error("useAcademy must be used inside <AcademyProvider>");
  return ctx;
}
