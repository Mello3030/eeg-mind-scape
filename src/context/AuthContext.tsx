import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Role = "researcher" | "administrator";
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

interface AuthValue {
  user: SessionUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  register: (input: { name: string; email: string; password: string; role: Role }) => Promise<SessionUser>;
  logout: () => void;
}

const KEY = "qsfe.session.v1";
const AuthContext = createContext<AuthValue | null>(null);

/**
 * Client-side demo session only (frontend-only build).
 * Production replaces this with the JWT issued by POST /api/auth/login.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setUser(JSON.parse(raw) as SessionUser);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const value = useMemo<AuthValue>(() => {
    const persist = (u: SessionUser) => {
      window.localStorage.setItem(KEY, JSON.stringify(u));
      setUser(u);
      return u;
    };
    return {
      user,
      ready,
      login: async (email, password) => {
        if (!email.includes("@") || password.length < 6) throw new Error("Invalid email or password.");
        return persist({
          id: "usr_demo",
          email,
          name: (email.split("@")[0] ?? "researcher").replace(/[._]/g, " "),
          role: email.startsWith("admin") ? "administrator" : "researcher",
        });
      },
      register: async ({ name, email, password, role }) => {
        if (password.length < 6) throw new Error("Password must be at least 6 characters.");
        return persist({ id: "usr_" + Math.random().toString(36).slice(2, 8), email, name, role });
      },
      logout: () => {
        window.localStorage.removeItem(KEY);
        setUser(null);
      },
    };
  }, [user, ready]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}