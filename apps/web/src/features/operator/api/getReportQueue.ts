import { http } from "@/lib/axios";
import type { GeoPoint } from "@/types/common";
import type { IncidentCategory } from "@/types/incident";
import type { MediaAsset, Report } from "@/types/report";

interface RawReportItem {
  id: string;
  reporterId?: string;
  reporter_id?: string;
  createdAt?: string;
  created_at?: string;
  channel?: Report["channel"];
  category?: IncidentCategory;
  text?: string;
  raw_text?: string;
  location?: GeoPoint;
  locationLabel?: string;
  location_label?: string;
  media?: MediaAsset[];
  processingState?: Report["processingState"];
  processing_state?: Report["processingState"];
  deliveryState?: Report["deliveryState"];
  delivery_state?: Report["deliveryState"];
  incidentId?: string;
  incident_id?: string;
  cancelledReason?: string;
  cancelled_reason?: string;
  synthetic?: boolean;
}

export async function getReportQueue(): Promise<Report[]> {
  const res = await http.get("/operator/reports/queue");
  const items: RawReportItem[] = Array.isArray(res.data?.items)
    ? res.data.items
    : Array.isArray(res.data)
      ? res.data
      : [];
  return items.map((r): Report => ({
    id: String(r.id),
    reporterId: r.reporterId || r.reporter_id || "usr_citizen",
    createdAt: r.createdAt || r.created_at || new Date().toISOString(),
    channel: r.channel || "form",
    category: r.category || "other",
    text: r.text || r.raw_text || "",
    location:
      r.location && typeof r.location === "object"
        ? r.location
        : { lat: 28.5452, lng: 77.2731, source: "unknown" },
    locationLabel: r.locationLabel || r.location_label || "Campus Area",
    media: r.media || [],
    processingState: r.processingState || r.processing_state || "received",
    deliveryState: r.deliveryState || r.delivery_state || "received_by_server",
    incidentId: r.incidentId || r.incident_id,
    cancelledReason: r.cancelledReason || r.cancelled_reason,
    synthetic: Boolean(r.synthetic ?? false),
  }));
}
