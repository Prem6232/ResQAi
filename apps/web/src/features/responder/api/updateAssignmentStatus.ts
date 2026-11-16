import { http } from "@/lib/axios";
import type { AssignmentStatus } from "@/types/assignment";

export async function updateAssignmentStatus(id: string, status: AssignmentStatus, reason?: string) {
  const res = await http.post(`/responder/assignments/${id}/status`, {
    status,
    reason,
    explanation: status === "failed" ? reason || "Unable to complete mission" : undefined,
  });
  return res.data;
}
