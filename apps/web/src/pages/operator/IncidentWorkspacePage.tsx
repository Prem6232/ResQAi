import { CommandShell } from "@/components/common/CommandShell";
import { IncidentDetailSheet } from "@/features/operator/components/IncidentDetailSheet";
import { mockApi } from "@/lib/mock-api";
import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import type { Incident } from "@/types/incident";

export function IncidentWorkspacePage() {
  const { id } = useParams();
  const [incident, setIncident] = useState<Incident | null>(null);

  useEffect(() => {
    mockApi.incidents().then((list) => {
      const found = list.find((i) => i.id === id) ?? list[0] ?? null;
      setIncident(found);
    });
  }, [id]);

  return (
    <CommandShell mode="operator" title={`Incident ${incident?.publicCode || ""}`}>
      <div className="max-w-xl rounded-3xl bg-white p-6 shadow-card">
        {incident ? (
          <IncidentDetailSheet incident={incident} />
        ) : (
          <p className="text-sm text-ink-700/50">Loading incident details...</p>
        )}
      </div>
    </CommandShell>
  );
}
