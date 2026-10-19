import type { AssignmentStatus } from "@/types/assignment";

export async function updateAssignmentStatus(id: string, status: AssignmentStatus) {
  return { id, status };
}
