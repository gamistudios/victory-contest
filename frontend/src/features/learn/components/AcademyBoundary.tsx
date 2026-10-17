import { Outlet, useLocation } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAcademy } from "../context/AcademyContext";
import { CardSkeleton } from "./States";

/**
 * Error surface for the Learn routes: a broken lesson or dashboard shows the
 * retry card instead of unmounting the app, and moving to another Learn screen
 * clears it automatically (resetKey = pathname).
 */
export function AcademyBoundary() {
  const { pathname } = useLocation();
  const { loading } = useAcademy();
  // Hold the Learn screens until the profile is aligned with the student's program, so they never flash
  // (or fetch) another program's content first.
  if (loading) return <div className="space-y-3 p-4"><CardSkeleton className="h-24" /><CardSkeleton className="h-36" /></div>;
  return (
    <ErrorBoundary resetKey={pathname} label="This lesson">
      <Outlet />
    </ErrorBoundary>
  );
}

export default AcademyBoundary;
