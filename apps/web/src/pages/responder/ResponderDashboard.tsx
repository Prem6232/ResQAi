import { MobileHeader } from "@/components/common/Header";
import { ResponderStatusToggle } from "@/components/coordination/ResponderStatusToggle";
import { ResponderOfferCard } from "@/components/coordination/ResponderOfferCard";
import { mockApi } from "@/lib/mock-api";
import { useState, useEffect } from "react";
import type { Assignment } from "@/types/assignment";
import type { Incident } from "@/types/incident";
import { formatRelative } from "@/lib/utils";
import { StatusIndicator } from "@/components/common/StatusIndicator";

export function ResponderDashboard() {
  const [onDuty, setOnDuty] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    mockApi.assignments().then(setAssignments);
    mockApi.incidents().then(setIncidents);
  }, []);

  const offer = assignments.find((a) => a.status === "offered");
  const incident = incidents.find((i) => i.id === offer?.incidentId);
  const resolved = incidents.filter((i) => i.status === "resolved" || i.status === "closed");

  const handleRespond = async (status: "accepted" | "declined") => {
    if (offer) {
      await mockApi.respondToOffer(offer.id, status);
      const updated = await mockApi.assignments();
      setAssignments(updated);
    }
  };

  return (
    <div>
      <MobileHeader
        role="First responder"
        right={<ResponderStatusToggle onDuty={onDuty} onChange={setOnDuty} />}
      />
      <h1 className="mt-2 font-display text-2xl font-extrabold">Awaiting response</h1>
      <div className="mt-4">
        {offer && incident ? (
          <ResponderOfferCard
            incident={incident}
            assignment={offer}
            onAccept={() => handleRespond("accepted")}
            onDecline={() => handleRespond("declined")}
          />
        ) : (
          <p className="text-sm text-ink-700/50">No open offers.</p>
        )}
      </div>
      <div className="mt-4 space-y-2">
        {resolved.map((inc) => (
          <div key={inc.id} className="flex items-center justify-between rounded-3xl bg-white p-4 shadow-card">
            <div>
              <p className="font-medium">{inc.title}</p>
              <p className="text-xs text-ink-700/50">
                {inc.locationLabel} · {formatRelative(inc.updatedAt)}
              </p>
            </div>
            <StatusIndicator label="Resolved" tone="ok" />
          </div>
        ))}
      </div>
    </div>
  );
}
