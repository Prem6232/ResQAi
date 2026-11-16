import { useContext } from "react";
import { OfflineSyncCtx } from "@/context/offlineSyncStore";

export function useOfflineSync() {
  const ctx = useContext(OfflineSyncCtx);
  if (!ctx) throw new Error("useOfflineSync requires OfflineSyncProvider");
  return ctx;
}
