import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ResponderOfferCard } from "@/components/coordination/ResponderOfferCard";
import { api } from "@/lib/api";
import { useLiveEvents } from "@/hooks/useLiveEvents";
import { playAlertChime } from "@/lib/audioAlerts";
import { useState, useEffect, useCallback, useRef } from "react";
import type { Assignment, AssignmentIncidentSummary } from "@/types/assignment";

function isResponderSoundEnabled(): boolean {
  try {
    return localStorage.getItem("sg.responder.sound") !== "false";
  } catch {
    return true;
  }
}

export function OfferNotificationModal({ onResponded }: { onResponded?: () => void }) {
  const { events } = useLiveEvents();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [incident, setIncident] = useState<AssignmentIncidentSummary | null>(null);
  const lastEventIdRef = useRef<string | null>(null);

  const checkOffers = useCallback(async (triggerChime: boolean) => {
    const assignments = await api.assignments();
    const off = assignments.find((a) => a.status === "offered");
    if (off?.incident) {
      setAssignment(off);
      setIncident(off.incident);
      setError(null);
      setOpen(true);
      if (triggerChime && isResponderSoundEnabled()) {
        playAlertChime("offer");
      }
    } else {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    void checkOffers(false);
  }, [checkOffers]);

  useEffect(() => {
    if (events.length === 0) return;
    const latest = events[0];
    if (latest.id === lastEventIdRef.current) return;
    lastEventIdRef.current = latest.id;

    if (latest.type === "assignment.offered") {
      void checkOffers(true);
    } else if (
      latest.type === "assignment.updated" ||
      latest.type === "assignment.expired" ||
      latest.type === "assignment.failed" ||
      latest.type === "incident.updated"
    ) {
      void checkOffers(false);
    }
  }, [events, checkOffers]);

  const handleRespond = async (status: "accepted" | "declined") => {
    if (!assignment || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.respondToOffer(assignment.id, status);
      setOpen(false);
      onResponded?.();
    } catch {
      setError("Could not submit response. Offer may have expired.");
      await checkOffers(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (!assignment || !incident) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle>Assignment offer</DialogTitle>
        <DialogDescription className="text-xs text-ink-700/60">
          Review incoming assignment details and accept or decline before the timer expires.
        </DialogDescription>
        {error ? <p className="mt-2 text-xs text-sos-600">{error}</p> : null}
        <div className="mt-3">
          <ResponderOfferCard
            incident={incident}
            assignment={assignment}
            busy={submitting}
            onAccept={() => void handleRespond("accepted")}
            onDecline={() => void handleRespond("declined")}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
