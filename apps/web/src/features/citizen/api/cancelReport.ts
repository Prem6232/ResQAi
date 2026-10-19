export async function cancelReport(id: string, reason: string) {
  return { id, reason, status: "cancelled" as const };
}
