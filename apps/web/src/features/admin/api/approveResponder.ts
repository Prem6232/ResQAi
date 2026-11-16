import { http } from "@/lib/axios";

export async function approveResponder(id: string, approved: boolean) {
  const res = await http.post(`/admin/responders/${id}/approve`, {
    approved,
    approve: approved,
  });
  return res.data;
}
