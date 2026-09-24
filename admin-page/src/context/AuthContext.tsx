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
import { useLocation, useNavigate } from "react-router-dom";
interface AuthContextType {
  user: any;
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
  const [user, setUser] = useState(null as any); // Initialize user state
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const fetchMe = async () => {
      setLoading(true);
      try {
        const user = await getMe();
        setUser(user);
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
    try {
      const res = await loginUser(email, password);
      const {
        message,
      }: { message: null | { isApproved: boolean; auth: boolean } } = res;
      console.log(message);
      if (message === null) {
        throw new Error("user not found");
      }

      if (message.auth == false) {
        throw new Error("Wrong password!");
      }
      if (message.isApproved == false) {
        throw new Error(
          "Your are not approve by another admin. Please wait until you approved!"
        );
      }
      window.location.reload();
    } catch (err) {
      if (err instanceof Error) {
        throw new Error(err.message);
      } else {
        throw new Error("Connection issue");
      }
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
    try {
      await userLogout();
      window.location.reload();
    } catch (err) {
      if (err instanceof Error) {
        throw new Error(err.message);
      } else {
        throw new Error("Connection issue");
      }
    }
    window.location.reload();
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
