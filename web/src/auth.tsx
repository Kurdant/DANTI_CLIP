import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

interface AuthState {
  user: string;
  csrf: string;
}

interface AuthCtx extends AuthState {
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: { username: string }; csrfToken: string }>("/api/auth/me")
      .then((me) => setAuth({ user: me.user.username, csrf: me.csrfToken }))
      .catch(() => setAuth(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(username: string, password: string) {
    const r = await api<{ user: { username: string }; csrfToken?: string }>("/api/auth/login", {
      method: "POST",
      body: { username, password },
    });
    const me = await api<{ user: { username: string }; csrfToken: string }>("/api/auth/me");
    setAuth({ user: me.user.username, csrf: me.csrfToken });
  }

  async function register(username: string, password: string) {
    await api("/api/auth/register", { method: "POST", body: { username, password } });
    const me = await api<{ user: { username: string }; csrfToken: string }>("/api/auth/me");
    setAuth({ user: me.user.username, csrf: me.csrfToken });
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setAuth(null);
  }

  return (
    <Ctx.Provider value={{ user: auth?.user ?? "", csrf: auth?.csrf ?? "", loading, login, register, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
