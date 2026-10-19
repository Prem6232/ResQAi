import type { IncidentCategory, Urgency } from "./incident";

export interface TextAssessment {
  suggestedCategory: IncidentCategory;
  suggestedUrgency: Urgency;
  modelScore: number;
  scoreMeaning: "Relative classifier score, not probability the incident is real.";
  reviewRequired: boolean;
  explanation: string;
  modelVersion: string;
}

export interface VisionAssessment {
  pipeline: "fire_smoke";
  finding: "possible_fire_smoke_evidence" | "no_supported_visual_evidence" | "unavailable";
  modelScore?: number;
  modelVersion?: string;
  adapter: "live_model" | "unavailable" | "labelled_demo_adapter";
}

export interface DuplicateCandidate {
  incidentId: string;
  score: number;
  signals: string[];
  recommendation: "review" | "likely_related" | "weak";
}

export interface EvidenceAssessment {
  linkedReports: number;
  temporalConsistency: "aligned" | "spread" | "unknown";
  locationConsistency: "aligned" | "spread" | "unknown";
  reusedMediaFlag: boolean;
  corroboratingVisual: boolean;
  missing: string[];
  conflicting: string[];
  text?: TextAssessment;
  vision?: VisionAssessment;
  duplicates: DuplicateCandidate[];
}
