import type { GeoPoint } from "./common";
import type { IncidentCategory } from "./incident";

export type ResponderAvailability = "available" | "busy" | "off_duty" | "offline";

export type ResponderCapability =
  | "first_aid"
  | "firefighting"
  | "rescue"
  | "hazard"
  | "security_patrol";

export interface ResponderProfile {
  id: string;
  userId: string;
  unitCode: string;
  displayName: string;
  type: "campus_security" | "volunteer" | "medical_volunteer" | "fire_warden";
  status: ResponderAvailability;
  capabilities: ResponderCapability[];
  lastLocation?: GeoPoint;
  lastLocationAt?: string;
  currentJob?: string;
  shareLocation: boolean;
  approved: boolean;
  synthetic?: boolean;
}

export interface NearbyAlert {
  id: string;
  category: IncidentCategory;
  title: string;
  distanceLabel: string;
  statusLabel: string;
  tone: "active" | "caution";
  coarsened: true;
}
