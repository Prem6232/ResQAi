import { http } from "@/lib/axios";

export async function cancelReport(id: string, reason: string) {
  const res = await http.post(`/citizen/reports/${id}/cancel`, {
    reason,
  });
  return res.data;
}
