import { createContext } from "react";
import type { useWebSocket } from "@/hooks/useWebSocket";

export const WebSocketCtx = createContext<ReturnType<typeof useWebSocket> | null>(null);
