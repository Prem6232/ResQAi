import { Button } from "@/components/ui/button";
import { StatusIndicator } from "@/components/common/StatusIndicator";
import type { Assignment } from "@/types/assignment";
import type { Incident } from "@/types/incident";

export function ResponderOfferCard({
  incident,
  assignment,
  onAccept,
  onDecline,
}: {
  incident: Incident;
  assignment: Assignment;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="rounded-3xl border border-black/5 bg-white p-4 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-sos-500">Featured job</p>
      <h3 className="mt-1 font-display text-lg font-bold">{incident.title}</h3>
      <p className="text-sm text-ink-700/60">{incident.locationLabel}</p>
      <div className="mt-3 flex gap-2">
        <StatusIndicator label={incident.urgency} tone="danger" />
        <StatusIndicator label={`${assignment.etaMinutes ?? "?"} min`} tone="neutral" />
        <StatusIndicator label={`${assignment.distanceKm ?? "?"} km`} tone="neutral" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onDecline}>
          Decline
        </Button>
        <Button variant="duty" onClick={onAccept}>
          Accept
        </Button>
      </div>
    </div>
  );
}
