import { useContext } from "react";
import { WebSocketCtx } from "@/context/webSocketStore";

export function useLiveEvents() {
  const ctx = useContext(WebSocketCtx);
  if (!ctx) throw new Error("useLiveEvents requires WebSocketProvider");
  return ctx;
}
