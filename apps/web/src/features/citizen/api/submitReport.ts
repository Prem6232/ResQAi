import { api } from "@/lib/api";
import type { IncidentCategory } from "@/types/incident";
import type { GeoPoint } from "@/types/common";

export function submitReport(input: {
  category: IncidentCategory;
  text: string;
  location: GeoPoint;
  locationLabel: string;
  channel: "sos" | "form" | "voice";
  idempotencyKey: string;
  delivered: boolean;
}) {
  return api.submitReport(input);
}
