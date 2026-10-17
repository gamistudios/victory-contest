import { Outlet, useLocation } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";

/**
 * Error surface for the Learn routes: a broken lesson or dashboard shows the
 * retry card instead of unmounting the app, and moving to another Learn screen
 * clears it automatically (resetKey = pathname).
 */
export function AcademyBoundary() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname} label="This lesson">
      <Outlet />
    </ErrorBoundary>
  );
}

export default AcademyBoundary;
