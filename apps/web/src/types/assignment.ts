import type { GeoPoint } from "./common";
import type { IncidentCategory, IncidentStatus, Urgency } from "./incident";

export type AssignmentStatus =
  | "offered"
  | "accepted"
  | "en_route"
  | "arrived"
  | "completed"
  | "declined"
  | "expired"
  | "cancelled"
  | "failed";

export interface AssignmentIncidentSummary {
  id: string;
  publicCode?: string;
  title: string;
  category: IncidentCategory;
  urgency: Urgency;
  status: IncidentStatus;
  location: GeoPoint;
  locationLabel: string;
}

export interface Assignment {
  id: string;
  incidentId: string;
  responderId: string;
  slotId: string;
  status: AssignmentStatus;
  offeredAt: string;
  offerDeadline?: string;
  acknowledgedAt?: string;
  completedAt?: string;
  etaMinutes?: number;
  distanceKm?: number;
  routeNote?: string;
  incident?: AssignmentIncidentSummary;
  synthetic?: boolean;
}

export interface AssignmentEvent {
  id: string;
  assignmentId: string;
  to: AssignmentStatus;
  at: string;
  reason?: string;
}
