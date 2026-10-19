import type { IncidentStatus } from "@/types/incident";

export async function updateIncidentState(id: string, status: IncidentStatus, reason: string) {
  return { id, status, reason };
}
