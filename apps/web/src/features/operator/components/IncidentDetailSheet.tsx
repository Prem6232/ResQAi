import type { Incident } from "@/types/incident";
import { AIEvidenceBadge } from "@/components/evidence/AIEvidenceBadge";

export function IncidentDetailSheet({ incident }: { incident: Incident }) {
  return (
    <div className="space-y-2 text-sm">
      <AIEvidenceBadge label={incident.evidenceLabel} />
      <p>{incident.locationLabel}</p>
      <p className="text-xs text-ink-700/50">Status {incident.status.replaceAll("_", " ")}</p>
    </div>
  );
}
