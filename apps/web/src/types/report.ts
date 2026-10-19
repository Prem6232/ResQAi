import type { DeliveryState, GeoPoint } from "./common";
import type { IncidentCategory, Urgency } from "./incident";

export type ReportChannel = "sos" | "form" | "voice";

export type ReportProcessingState =
  | "received"
  | "queued_for_ai"
  | "ai_complete"
  | "ai_failed"
  | "cancelled";

export interface MediaAsset {
  id: string;
  kind: "image" | "audio" | "video";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url?: string;
  demoNote?: string;
}

export interface Report {
  id: string;
  reporterId: string;
  createdAt: string;
  channel: ReportChannel;
  category: IncidentCategory;
  text: string;
  location: GeoPoint;
  locationLabel: string;
  media: MediaAsset[];
  processingState: ReportProcessingState;
  deliveryState: DeliveryState;
  incidentId?: string;
  cancelledReason?: string;
  synthetic: true;
}

export interface ReportDraft {
  idempotencyKey: string;
  createdAt: string;
  category: IncidentCategory;
  urgencyHint?: Urgency;
  text: string;
  location?: GeoPoint;
  locationLabel?: string;
  channel: ReportChannel;
}
