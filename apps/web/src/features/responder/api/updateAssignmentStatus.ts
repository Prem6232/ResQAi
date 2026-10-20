import { http } from "@/lib/axios";
import { apiConfig } from "@/config/api.config";
import type { AssignmentStatus } from "@/types/assignment";

export async function updateAssignmentStatus(id: string, status: AssignmentStatus, reason?: string) {
  if (apiConfig.useMock) {
    return { id, status };
  }
  const res = await http.post(`/responder/assignments/${id}/status`, {
    status,
    reason,
  });
  return res.data;
}
