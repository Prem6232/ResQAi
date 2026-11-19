import { api } from "@/lib/api";

export function getActiveIncidents() {
  return api.incidents();
}
