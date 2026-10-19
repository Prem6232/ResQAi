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

export interface Assignment {
  id: string;
  incidentId: string;
  responderId: string;
  slotId: string;
  status: AssignmentStatus;
  offeredAt: string;
  acknowledgedAt?: string;
  etaMinutes?: number;
  distanceKm?: number;
  routeNote?: string;
  synthetic: true;
}

export interface AssignmentEvent {
  id: string;
  assignmentId: string;
  to: AssignmentStatus;
  at: string;
  reason?: string;
}
