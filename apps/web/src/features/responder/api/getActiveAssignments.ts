import { api } from "@/lib/api";

export function getActiveAssignments() {
  return api.assignments();
}
