import { createContext } from "react";
import type { AuthTokens, LoginPayload, RegisterPayload, SessionUser } from "@/types/auth";

export interface AuthState {
  user: SessionUser | null;
  tokens: AuthTokens | null;
  loading: boolean;
  login: (p: LoginPayload) => Promise<SessionUser>;
  register: (p: RegisterPayload) => Promise<SessionUser>;
  logout: () => void;
}

export const AuthContext = createContext<AuthState | null>(null);
