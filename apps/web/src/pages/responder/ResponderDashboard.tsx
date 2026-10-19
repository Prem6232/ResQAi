import { MobileHeader } from "@/components/common/Header";
import { ResponderStatusToggle } from "@/components/coordination/ResponderStatusToggle";
import { ResponderOfferCard } from "@/components/coordination/ResponderOfferCard";
import { mockAssignments, mockIncidents } from "@/lib/mock-store";
import { useState } from "react";
import { formatRelative } from "@/lib/utils";
import { StatusIndicator } from "@/components/common/StatusIndicator";

export function ResponderDashboard() {
  const [onDuty, setOnDuty] = useState(true);
  const offer = mockAssignments.find((a) => a.status === "offered");
  const incident = mockIncidents.find((i) => i.id === offer?.incidentId);
  const resolved = mockIncidents.filter((i) => i.status === "resolved" || i.status === "closed");

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
            onAccept={() => undefined}
            onDecline={() => undefined}
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
