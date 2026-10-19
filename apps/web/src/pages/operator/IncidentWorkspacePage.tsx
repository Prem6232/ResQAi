import { CommandShell } from "@/components/common/CommandShell";
import { IncidentDetailSheet } from "@/features/operator/components/IncidentDetailSheet";
import { mockIncidents } from "@/lib/mock-store";
import { useParams } from "react-router-dom";

export function IncidentWorkspacePage() {
  const { id } = useParams();
  const incident = mockIncidents.find((i) => i.id === id) ?? mockIncidents[0];
  return (
    <CommandShell mode="operator" title={`Incident ${incident.publicCode}`}>
      <div className="max-w-xl rounded-3xl bg-white p-6 shadow-card">
        <IncidentDetailSheet incident={incident} />
      </div>
    </CommandShell>
  );
}
