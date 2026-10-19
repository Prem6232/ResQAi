import { createContext, useContext, type ReactNode } from "react";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";

const Ctx = createContext<ReturnType<typeof useOfflineQueue> | null>(null);

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const value = useOfflineQueue();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOfflineSync() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOfflineSync requires OfflineSyncProvider");
  return ctx;
}
