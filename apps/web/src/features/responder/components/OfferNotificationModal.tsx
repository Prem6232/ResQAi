import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ResponderOfferCard } from "@/components/coordination/ResponderOfferCard";
import { mockAssignments, mockIncidents } from "@/lib/mock-store";
import { useState } from "react";

export function OfferNotificationModal() {
  const [open, setOpen] = useState(true);
  const assignment = mockAssignments.find((a) => a.status === "offered");
  const incident = mockIncidents.find((i) => i.id === assignment?.incidentId);
  if (!assignment || !incident) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle>Assignment offer</DialogTitle>
        <div className="mt-3">
          <ResponderOfferCard
            incident={incident}
            assignment={assignment}
            onAccept={() => setOpen(false)}
            onDecline={() => setOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
