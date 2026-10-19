export type Role = "citizen" | "responder" | "operator";

export type IncidentCategory =
  | "fire_smoke"
  | "road_accident"
  | "water_flood"
  | "medical"
  | "personal_sos"
  | "hazard";

export type IncidentUrgency = "low" | "medium" | "high" | "critical";

export type ReportStatus =
  | "received"
  | "in_review"
  | "verified"
  | "dispatched"
  | "on_scene"
  | "resolved"
  | "false_alarm";

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
  mediaUri?: string;
  voiceTranscript?: string;
}

export interface ResponderJob {
  id: string;
  incidentNumber: number;
  title: string;
  category: IncidentCategory;
  urgency: IncidentUrgency;
  locationLabel: string;
  distance: string;
  eta: string;
  timeAgo: string;
  status: "offered" | "accepted" | "en_route" | "arrived" | "completed" | "declined";
  aiSummary?: string;
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
}

// -------------------------------------------------------------
// ML Model Input / Output Specifications (Where real models connect)
// -------------------------------------------------------------
export interface MLTextClassificationOutput {
  suggestedCategory: IncidentCategory;
  suggestedUrgency: IncidentUrgency;
  modelConfidence: number; // 0.0 - 1.0
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
