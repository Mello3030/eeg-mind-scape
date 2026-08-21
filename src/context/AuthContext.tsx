import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  apiLogin,
  apiMe,
  apiRegister,
  getToken,
  setToken,
  type Role,
  type SessionUser,
} from "@/services/api";

export type { Role, SessionUser };

interface AuthValue {
  user: SessionUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  register: (input: {
    name: string;
    email: string;
    password: string;
    role: Role;
  }) => Promise<SessionUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Session backed by the API's JWT (POST /api/auth/login|register, GET /api/auth/me).
 * The token lives in localStorage; a 401 on any request clears it. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (getToken()) {
        try {
          const me = await apiMe();
          if (!cancelled) setUser(me);
        } catch {
          setToken(null);
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      ready,
      login: async (email, password) => {
        const u = await apiLogin(email, password);
        // Anything cached belongs to whoever was signed in before.
        queryClient.clear();
        setUser(u);
        return u;
      },
      register: async (input) => {
        const u = await apiRegister(input);
        queryClient.clear();
        setUser(u);
        return u;
      },
      logout: () => {
        setToken(null);
        setUser(null);
        // Without this the next visitor sees the previous user's patients and
        // analyses from the React Query cache until each query refetches.
        queryClient.clear();
      },
    }),
    [user, ready, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
