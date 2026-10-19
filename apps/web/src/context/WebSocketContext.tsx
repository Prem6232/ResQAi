import { createContext, useContext, type ReactNode } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuth } from "@/hooks/useAuth";

const Ctx = createContext<ReturnType<typeof useWebSocket> | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const value = useWebSocket(Boolean(user));
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLiveEvents() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLiveEvents requires WebSocketProvider");
  return ctx;
}
