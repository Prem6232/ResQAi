import { http } from "@/lib/axios";
import { apiConfig } from "@/config/api.config";
import type { AssignmentStatus } from "@/types/assignment";

export async function acceptDeclineOffer(id: string, status: Extract<AssignmentStatus, "accepted" | "declined">, reason?: string) {
  if (apiConfig.useMock) {
    return { id, status, reason };
  }
  const res = await http.post(`/responder/offers/${id}/respond`, {
    status,
    reason,
  });
  return res.data;
}
