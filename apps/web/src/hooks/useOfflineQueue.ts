import { useCallback, useEffect, useState } from "react";
import { deleteDraft, listDrafts, saveDraft } from "@/lib/offline-storage";
import type { ReportDraft } from "@/types/report";
import { useOnlineStatus } from "./useOnlineStatus";

export function useOfflineQueue() {
  const online = useOnlineStatus();
  const [drafts, setDrafts] = useState<ReportDraft[]>([]);

  const refresh = useCallback(async () => {
    setDrafts(await listDrafts());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enqueue = async (draft: ReportDraft) => {
    await saveDraft(draft);
    await refresh();
  };

  const remove = async (key: string) => {
    await deleteDraft(key);
    await refresh();
  };

  return { drafts, enqueue, remove, refresh, online };
}
