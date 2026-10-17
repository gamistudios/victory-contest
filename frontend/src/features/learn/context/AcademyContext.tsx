import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AcademyStudent } from "@/types/academy";
import { getMe, updateMe } from "@/services/academy/academyApi";
import { myEnrollments } from "@/shared/pricing/api";
import { ensureStudentSession } from "@/services/telegramServices";

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
  /** Why the profile could not be loaded (offline, expired session). Null when in sync. */
  studentError: string | null;
  isPremium: boolean;
  setStudent: (s: AcademyStudent) => void;
  refreshStudent: () => Promise<void>;
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

/** Academy keeps its own level/stream, which only moves when the Learn sheet saves it. On first load of the
 *  app, align it with the student's primary enrolment (and that enrolment's stream) so Learn opens on the
 *  program they actually selected. The server derives the stream from the enrolment and rejects programs the
 *  student has not joined. Any failure just keeps the stored track. */
async function alignToPrimaryEnrollment(s: AcademyStudent): Promise<AcademyStudent> {
  try {
    const { enrollments, primary_program_id } = await myEnrollments();
    const target = enrollments.find((e) => e.program_id === primary_program_id) ?? enrollments[0];
    if (!target) return s;
    const es = target.stream_id;
    // startsWith tolerates the server's enrolment->academy stream aliases (e.g. "natural" -> "natural-science").
    const streamDiffers = !!es && es !== "common" && s.stream_id !== es && !s.stream_id.startsWith(es);
    if (s.level_id === target.program_id && !streamDiffers) return s;
    const next = await updateMe({ level_id: target.program_id });
    return next?.id ? next : s;
  } catch {
    return s;
  }
}

export function AcademyProvider({ children }: { children: ReactNode }) {
  const [student, setStudent] = useState<AcademyStudent | null>(null);
  const [loading, setLoading] = useState(true);
  const [studentError, setStudentError] = useState<string | null>(null);
  const [prefs, setPrefsState] = useState<Prefs>(readPrefs);
  const aligned = useRef(false);

  const refreshStudent = useCallback(async () => {
    try {
      const s = await getMe();
      // A 200 whose body has no student (an error page served by a proxy, a
      // changed payload) must not replace the cached profile with undefined -
      // every reader of `student` assumes the fields it asks for exist.
      if (!s?.id) throw new Error("Malformed profile response");
      // Once per app launch: default Learn to the student's primary program. Later refreshes (and a manual
      // pick in the Learn sheet) are left alone.
      let current = s;
      if (!aligned.current) {
        aligned.current = true;
        current = await alignToPrimaryEnrollment(s);
      }
      setStudent(current);
      setStudentError(null);
    } catch (e) {
      // A failed profile load must not escape as an unhandled rejection (it would
      // also wipe the cached student, which the shell still needs to render).
      setStudentError(e instanceof Error ? e.message : "Could not load your profile");
    } finally {
      setLoading(false);
    }
  }, []);

  // Every /academy/* route is student-auth only, and a child effect runs before
  // AuthProvider's, so the profile load waits for the session exchange instead of
  // reading a first-launch 401 as "could not load your profile".
  useEffect(() => {
    let alive = true;
    ensureStudentSession()
      .catch(() => undefined)
      .finally(() => {
        if (alive) refreshStudent();
      });
    return () => {
      alive = false;
    };
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

  const value = useMemo<Ctx>(
    () => ({ student, loading, studentError, isPremium: !!student?.is_premium, setStudent, refreshStudent, prefs, setPrefs }),
    [student, loading, studentError, refreshStudent, prefs, setPrefs],
  );
  return <AcademyContext.Provider value={value}>{children}</AcademyContext.Provider>;
}

export function useAcademy() {
  const ctx = useContext(AcademyContext);
  if (!ctx) throw new Error("useAcademy must be used inside <AcademyProvider>");
  return ctx;
}
