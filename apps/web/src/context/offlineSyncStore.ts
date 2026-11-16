import { createContext } from "react";
import type { useOfflineQueue } from "@/hooks/useOfflineQueue";

export const OfflineSyncCtx = createContext<ReturnType<typeof useOfflineQueue> | null>(null);
