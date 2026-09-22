// src/contexts/AuthContext.tsx

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useLocation, Navigate } from "react-router-dom";
import { getStudentById } from "../services/studentServices";
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

  const fetchUser = useCallback(async () => {
    if (!tgUser?.id) return;
    setStatus("pending");
    setError(null);
    try {
      const student = await getStudentById(tgUser?.id.toString()!);
      setUser(student);
      setStatus("success");
    } catch (err) {
      setError((err as any)?.message || "An unexpected error occurred.");
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
