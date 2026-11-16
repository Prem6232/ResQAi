import { CircleMarker, Tooltip } from "react-leaflet";
import type { Incident } from "@/types/incident";

const colors: Record<string, string> = {
  fire_smoke: "#E23B3B",
  road_accident: "#D97706",
  medical: "#0EA5E9",
  personal_safety: "#7C3AED",
  other: "#64748B",
};

export function IncidentMarker({
  incident,
  selected = false,
  onSelect,
}: {
  incident: Incident;
  selected?: boolean;
  onSelect?: (incident: Incident) => void;
}) {
  const lat = incident.hidePreciseLocationFromPublic
    ? incident.location.lat + 0.0008
    : incident.location.lat;
  const lng = incident.hidePreciseLocationFromPublic
    ? incident.location.lng - 0.0008
    : incident.location.lng;
  const strokeColor = selected ? "#0F172A" : colors[incident.category] || "#64748B";
  return (
    <CircleMarker
      center={[lat, lng]}
      radius={incident.urgency === "critical" ? (selected ? 16 : 14) : selected ? 12 : 9}
      pathOptions={{
        color: strokeColor,
        weight: selected ? 3.5 : 2,
        fillColor: colors[incident.category] || "#64748B",
        fillOpacity: selected ? 0.55 : 0.35,
      }}
      eventHandlers={
        onSelect
          ? {
              click: () => onSelect(incident),
            }
          : undefined
      }
    >
      <Tooltip>
        {incident.hidePreciseLocationFromPublic
          ? "Personal-safety · coarsened location"
          : `${incident.title} · ${incident.locationLabel}`}
      </Tooltip>
    </CircleMarker>
  );
}
