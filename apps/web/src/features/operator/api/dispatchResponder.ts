import { http } from "@/lib/axios";

export async function dispatchResponder(incidentId: string, responderId: string, note?: string) {
  const res = await http.post("/operator/actions/dispatch", {
    incidentId,
    incident_id: incidentId,
    responderId,
    responder_id: responderId,
    slotId: "slot_1",
    note,
  });
  return res.data;
}
