import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Operator = {
  email: string;
  name: string;
  role: "Warehouse Operator" | "Supervisor" | "Demo Guest";
};

export const DEMO_CREDENTIALS = {
  email: "operator@mocklogistics.io",
  password: "warehouse123",
  name: "Dana Ortiz",
  role: "Warehouse Operator" as const,
};

const STORAGE_KEY = "omnilogistics.session";
const USERS_KEY = "omnilogistics.users";

type AuthContextValue = {
  operator: Operator | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<Operator>;
  signUp: (name: string, email: string, password: string) => Promise<Operator>;
  signInAsDemo: () => Promise<Operator>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type StoredUser = { name: string; email: string; password: string };

function readUsers(): StoredUser[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(USERS_KEY) ?? "[]") as StoredUser[];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]) {
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [operator, setOperator] = useState<Operator | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setOperator(JSON.parse(raw) as Operator);
    } catch {
      /* ignore corrupt session */
    }
    setReady(true);
  }, []);

  const persist = useCallback((next: Operator) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setOperator(next);
    return next;
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await delay(450);
      const normalized = email.trim().toLowerCase();
      if (
        normalized === DEMO_CREDENTIALS.email &&
        password === DEMO_CREDENTIALS.password
      ) {
        return persist({
          email: DEMO_CREDENTIALS.email,
          name: DEMO_CREDENTIALS.name,
          role: DEMO_CREDENTIALS.role,
        });
      }
      const match = readUsers().find(
        (u) => u.email === normalized && u.password === password,
      );
      if (!match) throw new Error("Invalid credentials. Try the demo account.");
      return persist({ email: match.email, name: match.name, role: "Supervisor" });
    },
    [persist],
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      await delay(550);
      const normalized = email.trim().toLowerCase();
      const users = readUsers();
      if (normalized === DEMO_CREDENTIALS.email || users.some((u) => u.email === normalized)) {
        throw new Error("An operator with that email already exists.");
      }
      users.push({ name: name.trim(), email: normalized, password });
      writeUsers(users);
      return persist({ email: normalized, name: name.trim(), role: "Supervisor" });
    },
    [persist],
  );

  const signInAsDemo = useCallback(async () => {
    await delay(250);
    return persist({
      email: DEMO_CREDENTIALS.email,
      name: DEMO_CREDENTIALS.name,
      role: "Demo Guest",
    });
  }, [persist]);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setOperator(null);
  }, []);

  const value = useMemo(
    () => ({ operator, ready, signIn, signUp, signInAsDemo, signOut }),
    [operator, ready, signIn, signUp, signInAsDemo, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
