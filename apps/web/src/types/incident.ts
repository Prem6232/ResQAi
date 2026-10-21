import type { EvidenceLabel, GeoPoint } from "./common";

export type IncidentCategory =
  | "fire_smoke"
  | "road_accident"
  | "medical"
  | "personal_safety"
  | "other";

export type Urgency = "critical" | "high" | "medium" | "low";

export type IncidentStatus =
  | "reported"
  | "under_review"
  | "confirmed"
  | "assigned"
  | "en_route"
  | "on_scene"
  | "resolved"
  | "closed"
  | "cancelled"
  | "duplicate"
  | "unverified";

export interface Incident {
  id: string;
  publicCode: string;
  category: IncidentCategory;
  urgency: Urgency;
  status: IncidentStatus;
  title: string;
  location: GeoPoint;
  locationLabel: string;
  reportIds: string[];
  createdAt: string;
  updatedAt: string;
  evidenceLabel: EvidenceLabel;
  hidePreciseLocationFromPublic: boolean;
  synthetic?: boolean;
}

export interface IncidentStatusEvent {
  id: string;
  incidentId: string;
  from?: IncidentStatus;
  to: IncidentStatus;
  at: string;
  actorRole: string;
  note?: string;
}
