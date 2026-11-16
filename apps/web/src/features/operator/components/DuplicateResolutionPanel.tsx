import { DuplicateIncidentCard } from "@/components/evidence/DuplicateIncidentCard";
import { mockApi } from "@/lib/mock-api";
import type { DuplicateCandidate } from "@/types/ai-evidence";
import { useState, useEffect } from "react";

export function DuplicateResolutionPanel({
  incidentId,
  initialDuplicates,
}: {
  incidentId: string;
  initialDuplicates?: DuplicateCandidate[];
}) {
  const [dups, setDups] = useState<DuplicateCandidate[]>(initialDuplicates ?? []);

  useEffect(() => {
    if (initialDuplicates) {
      setDups(initialDuplicates);
      return;
    }
    if (incidentId) {
      mockApi.evidence(incidentId).then((data) => {
        setDups(data?.duplicates ?? []);
      });
    }
  }, [incidentId, initialDuplicates]);

  if (!dups.length) return <p className="text-sm text-ink-700/50">No duplicate candidates detected.</p>;
  return (
    <div className="space-y-2">
      {dups.map((d) => (
        <DuplicateIncidentCard key={d.incidentId} candidate={d} />
      ))}
    </div>
  );
}
