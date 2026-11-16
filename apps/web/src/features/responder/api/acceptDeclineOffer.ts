import { http } from "@/lib/axios";
import type { AssignmentStatus } from "@/types/assignment";

export async function acceptDeclineOffer(
  id: string,
  status: Extract<AssignmentStatus, "accepted" | "declined">,
  reason?: string
) {
  const res = await http.post(`/responder/offers/${id}/respond`, {
    status,
    reason,
  });
  return res.data;
}
