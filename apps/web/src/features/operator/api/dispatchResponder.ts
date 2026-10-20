import { http } from "@/lib/axios";
import { apiConfig } from "@/config/api.config";

export async function dispatchResponder(incidentId: string, responderId: string) {
  if (apiConfig.useMock) {
    return { incidentId, responderId, status: "offered" as const };
  }
  const res = await http.post("/operator/actions/dispatch", {
    incidentId,
    responderId,
    slotId: "slot_1",
  });
  return res.data;
}
