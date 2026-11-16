import type { ReactNode } from "react";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { OfflineSyncCtx } from "@/context/offlineSyncStore";

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const value = useOfflineQueue();
  return <OfflineSyncCtx.Provider value={value}>{children}</OfflineSyncCtx.Provider>;
}
