import { http } from "@/lib/axios";
import { apiConfig } from "@/config/api.config";
import { mockApi } from "@/lib/mock-api";
import type { Report } from "@/types/report";

export async function getReportQueue(): Promise<Report[]> {
  if (apiConfig.useMock) {
    return mockApi.myReports();
  }
  const res = await http.get("/operator/reports/queue");
  return (res.data?.items || res.data || []).map((r: any): Report => ({
    id: String(r.id),
    reporterId: r.reporterId || r.reporter_id || "usr_citizen",
    createdAt: r.createdAt || r.created_at || new Date().toISOString(),
    channel: r.channel || "form",
    category: r.category || "hazard",
    text: r.text || r.raw_text || "",
    location: r.location && typeof r.location === "object" ? r.location : { lat: 28.5452, lng: 77.2731 },
    locationLabel: r.locationLabel || r.location_label || "Campus Area",
    media: r.media || [],
    processingState: r.processingState || r.processing_state || "received",
    deliveryState: r.deliveryState || r.delivery_state || "received_by_server",
    incidentId: r.incidentId || r.incident_id,
    cancelledReason: r.cancelledReason || r.cancelled_reason,
    synthetic: true,
  }));
}
