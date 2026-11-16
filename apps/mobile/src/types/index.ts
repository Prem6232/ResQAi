export type Role = "citizen" | "responder" | "operator";

export type IncidentCategory =
  | "fire_smoke"
  | "road_accident"
  | "water_flood"
  | "medical"
  | "personal_sos"
  | "personal_safety"
  | "hazard"
  | "other";

export type IncidentUrgency = "low" | "medium" | "high" | "critical";

export type ReportStatus =
  | "received"
  | "in_review"
  | "verified"
  | "dispatched"
  | "on_scene"
  | "resolved"
  | "false_alarm";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface TrustedContact {
  id: string;
  name: string;
  initials: string;
  relation: string;
  phone: string;
  status: "active" | "pending";
}

export interface NearbyAlert {
  id: string;
  title: string;
  category: IncidentCategory;
  distance: string;
  distanceMeters: number;
  locationLabel: string;
  description: string;
  status: "active" | "responders_on_scene" | "in_review";
  badgeText: string;
  coordinate: { x: number; y: number }; // Relative 0..100 in radar grid
  location?: GeoPoint;
  tone?: "active" | "caution" | "resolved";
  urgency: IncidentUrgency;
  createdAt: string;
}

export interface CitizenReport {
  id: string;
  title: string;
  category: IncidentCategory;
  timestamp: string;
  status: ReportStatus;
  statusLabel: string;
  currentStep: number; // 1: Received, 2: Verified, 3: Dispatched, 4: Resolved
  stepDetails?: string;
  locationLabel: string;
  location?: GeoPoint;
  mediaUri?: string;
  voiceTranscript?: string;
}

export interface ResponderJob {
  id: string;
  incidentNumber: number;
  incidentId?: string;
  title: string;
  category: IncidentCategory;
  urgency: IncidentUrgency;
  locationLabel: string;
  location?: GeoPoint;
  distance: string;
  distanceKm?: number;
  eta: string;
  etaMinutes?: number;
  timeAgo: string;
  status: "offered" | "accepted" | "en_route" | "arrived" | "completed" | "declined";
  aiSummary?: string;
  routeNote?: string;
}

export interface ResponderProfile {
  unitCode: string;
  unitName: string;
  station: string;
  crewCount: number;
  isOnDuty: boolean;
  availability: "available" | "busy" | "off_duty";
  skills: string[];
  shareLiveLocation: boolean;
  alertSound: boolean;
  todayJobsCount: number;
  avgArrivalMinutes: number;
  acceptanceRatePct: number;
  lastLocation?: GeoPoint;
}

export interface CampusBuilding {
  id: string;
  name: string;
  code: string;
  lat: number;
  lng: number;
  type: "academic" | "library" | "hostel" | "medical" | "admin" | "sports" | "gate";
}

export interface MapIncidentItem {
  id: string;
  title: string;
  category: IncidentCategory;
  urgency: IncidentUrgency;
  location: GeoPoint;
  locationLabel: string;
  status: string;
  tone?: "active" | "caution" | "resolved";
  distanceKm?: number;
  etaMinutes?: number;
}

export interface MapResponderItem {
  id: string;
  unitCode: string;
  displayName: string;
  responderType: string;
  isOnDuty: boolean;
  availabilityStatus: "available" | "busy" | "off_duty";
  location: GeoPoint;
}

export interface OperatorKPISummary {
  totalIncidents: number;
  activeIncidents: number;
  resolvedIncidents: number;
  openReportsCount: number;
  activeRespondersCount: number;
  avgArrivalTimeMinutes: number;
  avgResponseTimeSeconds: number;
  falseAlarmRate: number;
  syntheticDrillMode: boolean;
}

// -------------------------------------------------------------
// ML Model Input / Output Specifications
// -------------------------------------------------------------
export interface MLTextClassificationOutput {
  suggestedCategory: IncidentCategory;
  suggestedUrgency: IncidentUrgency;
  modelConfidence: number;
  extractedLocation?: string;
  explanation: string;
}

export interface MLVoiceTranscriptionOutput {
  transcript: string;
  detectedLanguage: string;
  confidence: number;
}

export interface MLVisionDetectionOutput {
  fireSmokeDetected: boolean;
  confidence: number;
  boundingBoxes?: Array<{ x: number; y: number; width: number; height: number; label: string }>;
  explanation: string;
}

export interface MLDuplicateDetectionOutput {
  isDuplicateCandidate: boolean;
  existingIncidentId?: string;
  similarityScore: number;
}
