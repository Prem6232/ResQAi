import { MobileHeader } from "@/components/common/Header";
import { ResponderStatusToggle } from "@/components/coordination/ResponderStatusToggle";
import { ResponderOfferCard } from "@/components/coordination/ResponderOfferCard";
import { LiveResponderMap } from "@/components/maps/LiveResponderMap";
import { mockApi } from "@/lib/mock-api";
import { useState, useEffect, useCallback } from "react";
import type { Assignment } from "@/types/assignment";
import { formatRelative } from "@/lib/utils";
import { StatusIndicator } from "@/components/common/StatusIndicator";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { routes } from "@/config/routes.config";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useLiveEvents } from "@/hooks/useLiveEvents";
import { OfferNotificationModal } from "@/features/responder/components/OfferNotificationModal";

export function ResponderDashboard() {
  const { events } = useLiveEvents();
  const [onDuty, setOnDuty] = useState(true);
  const [unitCode, setUnitCode] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [history, setHistory] = useState<Assignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const geo = useGeolocation();

  const refresh = useCallback(async () => {
    const [activeList, historyList] = await Promise.all([
      mockApi.assignments(),
      mockApi.responderHistory(),
    ]);
    setAssignments(activeList);
    setHistory(historyList);
  }, []);

  useEffect(() => {
    void refresh();
    mockApi.responderProfile().then((prof) => {
      if (prof) {
        setOnDuty(prof.isOnDuty);
        setUnitCode(prof.unitCode);
      }
    });
    geo.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  useEffect(() => {
    if (events.length === 0) return;
    const latest = events[0];
    if (latest.type === "assignment.offered" || latest.type === "assignment.updated") {
      void refresh();
    }
  }, [events, refresh]);

  const offer = assignments.find((a) => a.status === "offered");
  const activeMission = assignments.find((a) =>
    a.status === "accepted" || a.status === "en_route" || a.status === "arrived"
  );
  const featuredAssignment = offer ?? activeMission ?? null;

  const handleRespond = async (status: "accepted" | "declined") => {
    if (!offer) return;
    setError(null);
    try {
      await mockApi.respondToOffer(offer.id, status);
      await refresh();
    } catch {
      setError("Failed to submit offer response.");
    }
  };

  const handleDutyChange = async (val: boolean) => {
    const previous = onDuty;
    setOnDuty(val);
    setError(null);
    try {
      await mockApi.updateDuty(val);
    } catch {
      setOnDuty(previous);
      setError("Could not update duty status.");
    }
  };

  return (
    <div>
      <OfferNotificationModal onResponded={() => void refresh()} />
      <MobileHeader
        role={unitCode ?? "Responder"}
        right={<ResponderStatusToggle onDuty={onDuty} onChange={handleDutyChange} />}
      />
      <h1 className="mt-2 font-display text-2xl font-extrabold">Awaiting response</h1>
      {error ? <p className="mt-2 text-xs text-sos-600">{error}</p> : null}
      <div className="mt-4">
        <LiveResponderMap
          mode="responder"
          height={230}
          selfPoint={geo.point}
          targetIncident={featuredAssignment?.incident ?? null}
          etaMinutes={featuredAssignment?.etaMinutes}
          distanceKm={featuredAssignment?.distanceKm}
          enableAutoPing={Boolean(activeMission)}
          onLocationSynced={() => void refresh()}
        />
      </div>
      <div className="mt-4">
        {offer && offer.incident ? (
          <ResponderOfferCard
            incident={offer.incident}
            assignment={offer}
            onAccept={() => handleRespond("accepted")}
            onDecline={() => handleRespond("declined")}
          />
        ) : activeMission && activeMission.incident ? (
          <div className="rounded-3xl border border-black/5 bg-white p-4 shadow-card">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-duty-600">
                Active mission
              </p>
              <StatusIndicator label={activeMission.status.replaceAll("_", " ")} tone="info" />
            </div>
            <h3 className="mt-1 font-display text-lg font-bold">{activeMission.incident.title}</h3>
            <p className="text-sm text-ink-700/60">{activeMission.incident.locationLabel}</p>
            <Button asChild className="mt-4 w-full" variant="dark">
              <Link to={routes.responder.active}>Open Active Mission</Link>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-ink-700/50">No open offers.</p>
        )}
      </div>
      <div className="mt-4 space-y-2">
        {history.slice(0, 6).map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-3xl bg-white p-4 shadow-card">
            <div>
              <p className="font-medium">{item.incident?.title ?? `Incident ${item.incidentId.slice(0, 6)}`}</p>
              <p className="text-xs text-ink-700/50">
                {item.incident?.locationLabel ?? "Campus Perimeter"} ·{" "}
                {formatRelative(item.completedAt || item.offeredAt)}
              </p>
            </div>
            <StatusIndicator
              label={item.status.replaceAll("_", " ")}
              tone={item.status === "completed" ? "ok" : "neutral"}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
