import { CircleMarker, Tooltip } from "react-leaflet";
import type { Incident } from "@/types/incident";

const colors: Record<string, string> = {
  fire_smoke: "#E23B3B",
  road_accident: "#D97706",
  medical: "#0EA5E9",
  personal_safety: "#7C3AED",
  other: "#64748B",
};

export function IncidentMarker({ incident }: { incident: Incident }) {
  const lat = incident.hidePreciseLocationFromPublic
    ? incident.location.lat + 0.0008
    : incident.location.lat;
  const lng = incident.hidePreciseLocationFromPublic
    ? incident.location.lng - 0.0008
    : incident.location.lng;
  return (
    <CircleMarker
      center={[lat, lng]}
      radius={incident.urgency === "critical" ? 14 : 9}
      pathOptions={{
        color: colors[incident.category],
        fillColor: colors[incident.category],
        fillOpacity: 0.35,
      }}
    >
      <Tooltip>
        {incident.hidePreciseLocationFromPublic
          ? "Personal-safety · coarsened location"
          : `${incident.title} · ${incident.locationLabel}`}
      </Tooltip>
    </CircleMarker>
  );
}
