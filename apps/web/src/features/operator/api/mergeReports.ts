import { http } from "@/lib/axios";

export async function mergeReports(reportIds: string[], reason: string, targetIncidentId: string) {
  const res = await http.post("/operator/actions/merge", {
    targetIncidentId,
    target_incident_id: targetIncidentId,
    reportIds,
    report_ids: reportIds,
    reason: reason || "Reports merged by operator",
  });
  return res.data;
}
