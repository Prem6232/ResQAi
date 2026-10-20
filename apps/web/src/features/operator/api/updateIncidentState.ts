import { http } from "@/lib/axios";
import { apiConfig } from "@/config/api.config";
import type { IncidentStatus } from "@/types/incident";

export async function updateIncidentState(id: string, status: IncidentStatus, reason: string) {
  if (apiConfig.useMock) {
    return { id, status, reason };
  }
  const res = await http.post("/operator/actions/state", {
    incidentId: id,
    toStatus: status,
    reason: reason || "Operator state update",
  });
  return res.data;
}
