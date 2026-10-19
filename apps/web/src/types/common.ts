export type Role = "citizen" | "responder" | "operator" | "admin";

export type DeliveryState = "local_saved" | "queued" | "received_by_server";

export type EvidenceLabel =
  | "unverified"
  | "insufficient_evidence"
  | "possible_duplicate"
  | "conflicting_evidence"
  | "confirmed_by_operator"
  | "false_or_malicious_after_review";

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracyMeters?: number;
  source: "gps" | "manual_map" | "unknown";
}

export interface Paginated<T> {
  items: T[];
  nextCursor?: string;
}

export interface ApiError {
  code: string;
  message: string;
}
