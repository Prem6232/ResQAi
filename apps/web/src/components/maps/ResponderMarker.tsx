import { CircleMarker, Tooltip } from "react-leaflet";
import type { ResponderProfile } from "@/types/responder";

export function ResponderMarker({ responder }: { responder: ResponderProfile }) {
  if (!responder.lastLocation || !responder.shareLocation) return null;
  return (
    <CircleMarker
      center={[responder.lastLocation.lat, responder.lastLocation.lng]}
      radius={6}
      pathOptions={{ color: "#147A4E", fillColor: "#1B9A64", fillOpacity: 0.9 }}
    >
      <Tooltip>
        {responder.unitCode} · {responder.status}
      </Tooltip>
    </CircleMarker>
  );
}
