import { http } from "@/lib/axios";
import { apiConfig } from "@/config/api.config";

export async function mergeReports(reportIds: string[], reason: string, targetIncidentId?: string) {
  if (apiConfig.useMock || !targetIncidentId) {
    return { reportIds, reason, preservedEvidence: true };
  }
  const res = await http.post("/operator/actions/merge", {
    targetIncidentId,
    reportIds,
    reason: reason || "Reports merged by operator",
  });
  return res.data;
}
