// src/contexts/AuthContext.tsx

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { useLocation, Navigate } from "react-router-dom";
import { getStudentById } from "../services/studentServices";
import { isAbortedRequest } from "../services/api";
import { AuthStudent } from "../types";
import { useTelegram } from "../hooks/useTelegram";
import Loader from "../components/Loader";
import ErrorState from "../components/ErrorState";

interface AuthContextType {
  user: AuthStudent | null;
  isLoading: boolean;
  error: string | null;
  refreshUser: () => void;
  setUser: React.Dispatch<React.SetStateAction<AuthStudent | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthStudent | null>(null);
  const [status, setStatus] = useState<"pending" | "success" | "error">(
    "pending"
  );
  const [error, setError] = useState<string | null>(null);
  const { user: tgUser, isLoading: tgLoading } = useTelegram();
  const location = useLocation();

  // Monotonic request id: only the latest fetchUser invocation may apply its
  // result. StrictMode double-invokes mount effects, so an earlier pass can
  // otherwise resolve after the newer one and clobber state.
  const fetchSeq = useRef(0);

  const fetchUser = useCallback(async () => {
    if (!tgUser?.id) return;
    const seq = ++fetchSeq.current;
    setStatus("pending");
    setError(null);
    try {
      const student = await getStudentById(tgUser.id.toString());
      if (seq !== fetchSeq.current) return; // stale response from a dead pass
      setUser(student);
      setStatus("success");
    } catch (err) {
      // A cancelled/aborted request is not an authentication failure: under
      // StrictMode and Vite dev full-reloads the in-flight GET /student/:id
      // can be aborted, which previously surfaced "Request aborted" inside
      // the "Authentication Failed" ErrorState. Leave state untouched; the
      // live (or next) pass resolves it.
      if (isAbortedRequest(err)) return;
      if (seq !== fetchSeq.current) return; // stale response from a dead pass
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
      setStatus("error");
    }
  }, [tgUser]);

  useEffect(() => {
    // Only fetch user data when Telegram is loaded and we have a user
    if (!tgLoading && tgUser?.id) {
      fetchUser();
    } else if (!tgLoading && !tgUser) {
      // If Telegram is loaded but no user, set status to success (for development/testing)
      setStatus("success");
    }
  }, [fetchUser, tgLoading, tgUser]);

  const isLoading = status === "pending";

  let content = children;

  if (isLoading) {
    content = <Loader />;
  } else if (status === "error") {
    content = (
      <ErrorState
        title="Authentication Failed"
        description={error || "We couldn't verify your identity."}
        onRetry={fetchUser}
        retryText="Try Again"
      />
    );
  } else if (!user && location.pathname !== "/register") {
    // Redirect unregistered users to registration
    content = <Navigate to="/register" replace />;
  } else if (user && location.pathname === "/register") {
    content = <Navigate to="/" replace />;
  }

  return (
    <AuthContext.Provider
      value={{ user, isLoading, error, refreshUser: fetchUser, setUser }}
    >
      {content}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
