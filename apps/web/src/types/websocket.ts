export interface WsEvent {
  id: string;
  type:
    | "report.received"
    | "incident.updated"
    | "assignment.offered"
    | "assignment.updated"
    | "ai.assessment.ready";
  occurredAt: string;
  incidentId?: string;
  payload: Record<string, unknown>;
}
