import { mockResponders } from "@/lib/mock-store";
import { StatusIndicator } from "@/components/common/StatusIndicator";

export function ResponderRosterDrawer() {
  return (
    <ul className="space-y-2">
      {mockResponders.map((r) => (
        <li key={r.id} className="flex items-center justify-between rounded-2xl bg-white px-3 py-2 text-sm">
          <span>
            {r.unitCode} · {r.type.replaceAll("_", " ")}
          </span>
          <StatusIndicator
            label={r.status.replaceAll("_", " ")}
            tone={r.status === "available" ? "ok" : r.status === "busy" ? "warn" : "neutral"}
          />
        </li>
      ))}
    </ul>
  );
}
