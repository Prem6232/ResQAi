import { LiveResponderMap } from "@/components/maps/LiveResponderMap";
import type { AssignmentIncidentSummary } from "@/types/assignment";
import type { GeoPoint } from "@/types/common";
import type { Incident } from "@/types/incident";

export function RouteGuidanceSheet({
  fromPoint,
  toPoint,
  targetIncident,
  durationMinutes,
  distanceKm,
  enableAutoPing = false,
  onLocationSynced,
}: {
  fromPoint?: GeoPoint;
  toPoint?: GeoPoint;
  targetIncident?: Incident | AssignmentIncidentSummary | null;
  durationMinutes?: number;
  distanceKm?: number;
  enableAutoPing?: boolean;
  onLocationSynced?: (point: GeoPoint) => void;
}) {
  const resolvedTarget: AssignmentIncidentSummary | null =
    targetIncident ??
    (toPoint
      ? {
          id: "active-target",
          title: "Incident Location",
          category: "other",
          urgency: "high",
          status: "assigned",
          location: toPoint,
          locationLabel: "Mission destination",
        }
      : null);

  return (
    <LiveResponderMap
      mode="responder"
      height={280}
      selfPoint={fromPoint}
      targetIncident={resolvedTarget}
      etaMinutes={durationMinutes}
      distanceKm={distanceKm}
      enableAutoPing={enableAutoPing}
      onLocationSynced={onLocationSynced}
    />
  );
}
