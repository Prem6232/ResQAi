import { DuplicateIncidentCard } from "@/components/evidence/DuplicateIncidentCard";
import { mockApi } from "@/lib/mock-api";
import { useState, useEffect } from "react";

export function DuplicateResolutionPanel({ incidentId }: { incidentId: string }) {
  const [dups, setDups] = useState<any[]>([]);

  useEffect(() => {
    if (incidentId) {
      mockApi.evidence(incidentId).then((data) => {
        setDups(data?.duplicates ?? []);
      });
    }
  }, [incidentId]);

  if (!dups.length) return <p className="text-sm text-ink-700/50">No duplicate candidates detected.</p>;
  return (
    <div className="space-y-2">
      {dups.map((d) => (
        <DuplicateIncidentCard key={d.incidentId || d.incident_id} candidate={d} />
      ))}
    </div>
  );
}
