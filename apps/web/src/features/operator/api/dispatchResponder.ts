export async function dispatchResponder(incidentId: string, responderId: string) {
  return { incidentId, responderId, status: "offered" as const };
}
