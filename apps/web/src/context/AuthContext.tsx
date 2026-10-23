import { createContext, useCallback, useMemo, useState, useEffect, type ReactNode } from "react";
import type { AuthTokens, LoginPayload, RegisterPayload, SessionUser } from "@/types/auth";
import { mockApi } from "@/lib/mock-api";

interface AuthState {
  user: SessionUser | null;
  tokens: AuthTokens | null;
  loading: boolean;
  login: (p: LoginPayload) => Promise<SessionUser>;
  register: (p: RegisterPayload) => Promise<SessionUser>;
  logout: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);

function readStored(): { user: SessionUser; tokens: AuthTokens } | null {
  const raw = localStorage.getItem("sg.session");
  if (!raw) return null;
  return JSON.parse(raw) as { user: SessionUser; tokens: AuthTokens };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const stored = readStored();
  const [user, setUser] = useState<SessionUser | null>(stored?.user ?? null);
  const [tokens, setTokens] = useState<AuthTokens | null>(stored?.tokens ?? null);

  const persist = (nextUser: SessionUser, nextTokens: AuthTokens) => {
    setUser(nextUser);
    setTokens(nextTokens);
    localStorage.setItem("sg.session", JSON.stringify({ user: nextUser, tokens: nextTokens }));
    localStorage.setItem("sg.tokens", JSON.stringify(nextTokens));
    window.dispatchEvent(new Event("sg:auth-changed"));
  };

  useEffect(() => {
    const sync = () => {
      const current = readStored();
      setUser(current?.user ?? null);
      setTokens(current?.tokens ?? null);
    };
    window.addEventListener("sg:auth-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("sg:auth-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const login = useCallback(async (p: LoginPayload) => {
    const res = await mockApi.login(p);
    persist(res.user, res.tokens);
    return res.user;
  }, []);

  const register = useCallback(async (p: RegisterPayload) => {
    const res = await mockApi.register(p);
    persist(res.user, res.tokens);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setTokens(null);
    localStorage.removeItem("sg.session");
    localStorage.removeItem("sg.tokens");
  }, []);

  const value = useMemo(
    () => ({ user, tokens, loading: false, login, register, logout }),
    [user, tokens, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
