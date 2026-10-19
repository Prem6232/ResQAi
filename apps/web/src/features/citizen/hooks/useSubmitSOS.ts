import { useMutation, useQueryClient } from "@tanstack/react-query";
import { submitReport } from "../api/submitReport";
import { useOfflineSync } from "@/context/OfflineSyncContext";
import { newId } from "@/lib/utils";
import type { IncidentCategory } from "@/types/incident";
import type { GeoPoint } from "@/types/common";

export function useSubmitSOS() {
  const queryClient = useQueryClient();
  const { enqueue, online } = useOfflineSync();

  return useMutation({
    mutationFn: async (input: {
      category: IncidentCategory;
      text: string;
      location: GeoPoint;
      locationLabel: string;
      channel: "sos" | "form" | "voice";
    }) => {
      const idempotencyKey = newId("idem");
      if (!online) {
        await enqueue({
          idempotencyKey,
          createdAt: new Date().toISOString(),
          category: input.category,
          text: input.text,
          location: input.location,
          locationLabel: input.locationLabel,
          channel: input.channel,
        });
        return { queued: true as const, idempotencyKey };
      }
      const report = await submitReport({
        ...input,
        idempotencyKey,
        delivered: true,
      });
      return { queued: false as const, report };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-reports"] });
    },
  });
}
