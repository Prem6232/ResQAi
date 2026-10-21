import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ResponderOfferCard } from "@/components/coordination/ResponderOfferCard";
import { mockApi } from "@/lib/mock-api";
import { useState, useEffect } from "react";
import type { Assignment } from "@/types/assignment";
import type { Incident } from "@/types/incident";

export function OfferNotificationModal() {
  const [open, setOpen] = useState(false);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [incident, setIncident] = useState<Incident | null>(null);

  useEffect(() => {
    Promise.all([mockApi.assignments(), mockApi.incidents()]).then(([as, incs]) => {
      const off = as.find((a) => a.status === "offered");
      if (off) {
        setAssignment(off);
        const inc = incs.find((i) => i.id === off.incidentId);
        if (inc) {
          setIncident(inc);
          setOpen(true);
        }
      }
    });
  }, []);

  const handleRespond = async (status: "accepted" | "declined") => {
    if (assignment) {
      await mockApi.respondToOffer(assignment.id, status);
      setOpen(false);
    }
  };

  if (!assignment || !incident) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle>Assignment offer</DialogTitle>
        <div className="mt-3">
          <ResponderOfferCard
            incident={incident}
            assignment={assignment}
            onAccept={() => handleRespond("accepted")}
            onDecline={() => handleRespond("declined")}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
