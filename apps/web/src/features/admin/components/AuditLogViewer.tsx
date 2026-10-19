import { useQuery } from "@tanstack/react-query";
import { getAuditLogs } from "../api/getAuditLogs";

export function AuditLogViewer() {
  const q = useQuery({ queryKey: ["audit"], queryFn: getAuditLogs });
  if (q.isLoading) return <p>Loading audit log…</p>;
  return (
    <ul className="space-y-2">
      {q.data?.map((row) => (
        <li key={row.id} className="rounded-2xl bg-white p-3 text-sm">
          <p className="font-medium">{row.action}</p>
          <p className="text-xs text-ink-700/50">
            {row.actor} → {row.target} · synthetic
          </p>
        </li>
      ))}
    </ul>
  );
}
