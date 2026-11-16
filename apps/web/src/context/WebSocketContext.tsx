import type { ReactNode } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuth } from "@/hooks/useAuth";
import { WebSocketCtx } from "@/context/webSocketStore";

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const value = useWebSocket(Boolean(user));
  return <WebSocketCtx.Provider value={value}>{children}</WebSocketCtx.Provider>;
}
