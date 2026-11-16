import { http } from "@/lib/axios";

export interface AuditLogRow {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  synthetic: boolean;
}

interface RawAuditLog {
  id: string;
  createdAt?: string;
  created_at?: string;
  at?: string;
  actorEmail?: string;
  actor_email?: string;
  actor?: string;
  action?: string;
  targetId?: string;
  target_id?: string;
  target?: string;
  synthetic?: boolean;
}

export async function getAuditLogs(): Promise<AuditLogRow[]> {
  const res = await http.get("/admin/audit-logs");
  const rawItems: RawAuditLog[] = Array.isArray(res.data?.items)
    ? res.data.items
    : Array.isArray(res.data)
      ? res.data
      : [];
  return rawItems.map((l) => ({
    id: String(l.id),
    at: l.at || l.createdAt || l.created_at || new Date().toISOString(),
    actor: l.actorEmail || l.actor_email || l.actor || "system",
    action: l.action || "SYSTEM_EVENT",
    target: l.target || l.targetId || l.target_id || "general",
    synthetic: Boolean(l.synthetic ?? true),
  }));
}
