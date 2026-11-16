import { http } from "@/lib/axios";
import type { IncidentStatus } from "@/types/incident";

export async function updateIncidentState(id: string, status: IncidentStatus, reason: string) {
  const res = await http.post("/operator/actions/state", {
    incidentId: id,
    incident_id: id,
    toStatus: status,
    to_status: status,
    reason: reason || "Operator state update",
  });
  return res.data;
}
