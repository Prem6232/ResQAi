import { useCallback, useEffect, useRef, useState } from "react";
import { deleteDraft, listDrafts, saveDraft } from "@/lib/offline-storage";
import { api } from "@/lib/api";
import { mapConfig } from "@/config/map.config";
import type { ReportDraft } from "@/types/report";
import { useOnlineStatus } from "./useOnlineStatus";

export function useOfflineQueue() {
  const online = useOnlineStatus();
  const [drafts, setDrafts] = useState<ReportDraft[]>([]);
  const [syncing, setSyncing] = useState(false);
  const flushingRef = useRef(false);

  const refresh = useCallback(async () => {
    setDrafts(await listDrafts());
  }, []);

  const flushDrafts = useCallback(async () => {
    if (!online || flushingRef.current) return 0;
    const queued = await listDrafts();
    if (queued.length === 0) return 0;

    flushingRef.current = true;
    setSyncing(true);
    let syncedCount = 0;
    try {
      for (const draft of queued) {
        try {
          await api.submitReport({
            category: draft.category,
            text: draft.text || "Offline draft synced",
            location: draft.location ?? {
              lat: mapConfig.campusCenter.lat,
              lng: mapConfig.campusCenter.lng,
              source: "unknown",
            },
            locationLabel: draft.locationLabel || "Bhopal Metro (offline sync)",
            channel: draft.channel,
            idempotencyKey: draft.idempotencyKey,
            delivered: true,
            mediaAssetIds: draft.mediaAssetIds,
          });
          await deleteDraft(draft.idempotencyKey);
          syncedCount += 1;
        } catch {
          // Retain failed draft in IndexedDB for next retry
        }
      }
      await refresh();
      return syncedCount;
    } finally {
      flushingRef.current = false;
      setSyncing(false);
    }
  }, [online, refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (online && drafts.length > 0) {
      void flushDrafts();
    }
  }, [online, drafts.length, flushDrafts]);

  const enqueue = async (draft: ReportDraft) => {
    await saveDraft(draft);
    await refresh();
  };

  const remove = async (key: string) => {
    await deleteDraft(key);
    await refresh();
  };

  return { drafts, enqueue, remove, refresh, flushDrafts, syncing, online };
}
