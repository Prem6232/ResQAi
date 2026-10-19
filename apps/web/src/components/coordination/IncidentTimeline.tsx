import type { IncidentStatusEvent } from "@/types/incident";
import { formatRelative } from "@/lib/utils";

export function IncidentTimeline({ events }: { events: IncidentStatusEvent[] }) {
  if (!events.length) {
    return <p className="text-sm text-ink-700/50">No timeline events yet.</p>;
  }
  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3 text-sm">
          <span className="mt-1 h-2 w-2 rounded-full bg-command-500" />
          <div>
            <p className="font-medium">{e.to.replaceAll("_", " ")}</p>
            <p className="text-xs text-ink-700/50">
              {formatRelative(e.at)} · {e.actorRole}
              {e.note ? ` · ${e.note}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
