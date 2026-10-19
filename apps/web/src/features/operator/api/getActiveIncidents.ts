import { mockApi } from "@/lib/mock-api";

export function getActiveIncidents() {
  return mockApi.incidents();
}
