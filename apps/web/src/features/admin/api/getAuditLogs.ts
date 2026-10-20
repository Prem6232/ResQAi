import { http } from "@/lib/axios";
import { apiConfig } from "@/config/api.config";

export interface AuditLogRow {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  synthetic: true;
}

export async function getAuditLogs(): Promise<AuditLogRow[]> {
  if (apiConfig.useMock) {
    return [
      {
        id: "aud_1",
        at: new Date().toISOString(),
        actor: "operator@campus.demo",
        action: "VIEW_INCIDENT",
        target: "inc_402",
        synthetic: true as const,
      },
    ];
  }
  const res = await http.get("/admin/audit-logs");
  return (res.data?.items || res.data || []).map((l: any) => ({
    id: String(l.id),
    at: l.createdAt || l.created_at || new Date().toISOString(),
    actor: l.actorEmail || l.actor_email || "admin@campus.demo",
    action: l.action || "SYSTEM_EVENT",
    target: l.targetId || l.target_id || "general",
    synthetic: true as const,
  }));
}
