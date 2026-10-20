import { http } from "@/lib/axios";
import { apiConfig } from "@/config/api.config";

export async function approveResponder(id: string, approved: boolean) {
  if (apiConfig.useMock) {
    return { id, approved };
  }
  const res = await http.post(`/admin/responders/${id}/approve`, {
    approve: approved,
  });
  return res.data;
}
