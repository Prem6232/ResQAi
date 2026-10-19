import { DuplicateIncidentCard } from "@/components/evidence/DuplicateIncidentCard";
import { mockEvidence } from "@/lib/mock-store";

export function DuplicateResolutionPanel({ incidentId }: { incidentId: string }) {
  const dups = mockEvidence[incidentId]?.duplicates ?? [];
  if (!dups.length) return <p className="text-sm text-ink-700/50">No duplicate candidates.</p>;
  return (
    <div className="space-y-2">
      {dups.map((d) => (
        <DuplicateIncidentCard key={d.incidentId} candidate={d} />
      ))}
    </div>
  );
}
