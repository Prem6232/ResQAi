import { http } from "@/lib/axios";
import { apiConfig } from "@/config/api.config";

export async function cancelReport(id: string, reason: string) {
  if (apiConfig.useMock) {
    return { id, reason, status: "cancelled" as const };
  }
  const res = await http.post(`/citizen/reports/${id}/cancel`, {
    reason,
  });
  return res.data;
}
