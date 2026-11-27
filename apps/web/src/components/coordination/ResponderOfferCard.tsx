import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusIndicator } from "@/components/common/StatusIndicator";
import type { Assignment, AssignmentIncidentSummary } from "@/types/assignment";
import type { Incident } from "@/types/incident";

function computeRemainingSeconds(deadline?: string): number | null {
  if (!deadline) return null;
  const ms = Date.parse(deadline) - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil(ms / 1000));
}

export function ResponderOfferCard({
  incident,
  assignment,
  busy = false,
  onAccept,
  onDecline,
}: {
  incident: Incident | AssignmentIncidentSummary;
  assignment: Assignment;
  busy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const [remaining, setRemaining] = useState<number | null>(() =>
    computeRemainingSeconds(assignment.offerDeadline)
  );

  useEffect(() => {
    setRemaining(computeRemainingSeconds(assignment.offerDeadline));
    if (!assignment.offerDeadline) return;
    const timer = window.setInterval(() => {
      setRemaining(computeRemainingSeconds(assignment.offerDeadline));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [assignment.id, assignment.offerDeadline]);

  return (
    <div className="rounded-3xl border border-black/5 bg-white p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-sos-500">Dispatch offer</p>
        {remaining !== null ? (
          <StatusIndicator
            label={remaining > 0 ? `${remaining}s left` : "Expired"}
            tone={remaining > 15 ? "warn" : "danger"}
          />
        ) : null}
      </div>
      <h3 className="mt-1 font-display text-lg font-bold">{incident.title}</h3>
      <p className="text-sm text-ink-700/60">{incident.locationLabel}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <StatusIndicator label={incident.urgency} tone="danger" />
        <StatusIndicator label={`${assignment.etaMinutes ?? "?"} min`} tone="neutral" />
        <StatusIndicator label={`${assignment.distanceKm ?? "?"} km`} tone="neutral" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={busy || remaining === 0} onClick={onDecline}>
          Decline
        </Button>
        <Button variant="duty" disabled={busy || remaining === 0} onClick={onAccept}>
          Accept
        </Button>
      </div>
    </div>
  );
}
