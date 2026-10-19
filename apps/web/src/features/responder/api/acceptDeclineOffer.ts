import type { AssignmentStatus } from "@/types/assignment";

export async function acceptDeclineOffer(id: string, status: Extract<AssignmentStatus, "accepted" | "declined">, reason?: string) {
  return { id, status, reason };
}
