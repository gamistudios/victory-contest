import LoadingOverlay from "@/components/ui/LoadingOverlay";
import { loginUser, registerUser } from "@/lib/utils";
import { getMe, userLogout } from "@/services/api";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { isAxiosError } from "axios";
import { useLocation, useNavigate } from "react-router-dom";

// Shape returned by GET /api/admin/me (domain.Admin JSON) plus the optional
// avatar field the header/sidebar read.
export interface AuthUser {
  id?: string;
  name: string;
  email: string;
  imgurl?: string;
  is_approved?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (data: {
    email: string;
    password: string;
    name: string;
  }) => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null); // Initialize user state
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const fetchMe = async () => {
      setLoading(true);
      try {
        const user = await getMe();
        // A misconfigured server can answer /api/admin/me with the SPA's own
        // index.html (200, HTML string) — axios hands that back as a truthy
        // string, which used to flow into components as "the user" and crash
        // them (e.g. user.name.charAt(0) in the appbar). Only accept a plain
        // object; anything else counts as signed out.
        if (user && typeof user === "object" && !Array.isArray(user)) {
          setUser(user);
        } else {
          console.error("GET /api/admin/me returned a non-object body; treating as signed out");
          if (location.pathname !== "/register") {
            navigate("/");
          }
        }
      } catch (error) {
        console.error("Failed to fetch user:", error);
        if (location.pathname != "/register") {
          navigate("/");
        }
      } finally {
        setLoading(false);
      }
    };
    fetchMe();
  }, []);

  const login = async (email: string, password: string) => {
    // Backend contract (POST /api/admin/login): 200 + Set-Cookie on success,
    // 401 invalid credentials, 403 valid-but-unapproved account. The old
    // {message:{auth,isApproved}} destructure matched nothing the API returns.
    try {
      await loginUser(email, password);
      window.location.reload();
    } catch (err) {
      if (isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 401) {
          throw new Error("Wrong email or password");
        }
        if (status === 403) {
          throw new Error("Your account is not approved by another admin yet");
        }
        throw new Error("Login failed. Please try again.");
      }
      throw new Error("Connection issue");
    }
  };
  const register = async (data: {
    email: string;
    password: string;
    name: string;
  }) => {
    try {
      await registerUser(data);
      navigate("/");
    } catch (err) {
      if (err instanceof Error) {
        throw new Error(err.message);
      } else {
        throw new Error("Connection issue");
      }
    }
  };

  const logout = async () => {
    // Ask the backend to expire the HttpOnly session cookie, then clear the
    // local auth state and send the user back to the login page. Even if the
    // request fails (e.g. offline) the client-side state must reset.
    try {
      await userLogout();
    } catch (err) {
      console.error("Logout request failed:", err);
    }
    setUser(null);
    navigate("/");
  };
  if (loading) {
    return <LoadingOverlay />;
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, register, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
