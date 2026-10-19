import { mockApi } from "@/lib/mock-api";

export function getActiveAssignments() {
  return mockApi.assignments();
}
