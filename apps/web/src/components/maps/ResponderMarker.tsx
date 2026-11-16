import { CircleMarker, Popup, Tooltip } from "react-leaflet";
import type { ResponderProfile } from "@/types/responder";
import { formatRelative } from "@/lib/utils";
import {
  formatCoordinates,
  getResponderStatusTheme,
  isResponderTrackable,
} from "./liveResponderMapUtils";

export function ResponderMarker({
  responder,
  selected = false,
  onSelect,
}: {
  responder: ResponderProfile;
  selected?: boolean;
  onSelect?: (responder: ResponderProfile) => void;
}) {
  if (!isResponderTrackable(responder) || !responder.lastLocation) return null;

  const { lat, lng } = responder.lastLocation;
  const theme = getResponderStatusTheme(responder.status);

  return (
    <>
      {theme.pulse || selected ? (
        <CircleMarker
          center={[lat, lng]}
          radius={selected ? 16 : 12}
          pathOptions={{
            color: selected ? "#0F8A7A" : theme.color,
            weight: selected ? 2.5 : 1.5,
            fillColor: selected ? "#0F8A7A" : theme.fillColor,
            fillOpacity: selected ? 0.22 : 0.14,
          }}
        />
      ) : null}
      <CircleMarker
        center={[lat, lng]}
        radius={selected ? 8 : 7}
        eventHandlers={{
          click: () => onSelect?.(responder),
        }}
        pathOptions={{
          color: "#FFFFFF",
          weight: 2,
          fillColor: theme.fillColor,
          fillOpacity: 0.96,
        }}
      >
        <Tooltip direction="top" offset={[0, -6]}>
          <span className="font-semibold">{responder.unitCode}</span> · {theme.label}
        </Tooltip>
        <Popup>
          <div className="min-w-[180px] space-y-1 text-xs text-ink-900">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-sm font-bold">{responder.unitCode}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${theme.badgeClass}`}>
                {theme.label}
              </span>
            </div>
            <p className="font-medium text-ink-700">{responder.displayName}</p>
            <p className="text-[11px] text-ink-700/60">
              {responder.type.replaceAll("_", " ")} · {formatCoordinates(lat, lng)}
            </p>
            {responder.capabilities.length > 0 ? (
              <p className="text-[11px] text-ink-700/70">
                Skills: {responder.capabilities.map((c) => c.replaceAll("_", " ")).join(", ")}
              </p>
            ) : null}
            {responder.lastLocationAt ? (
              <p className="text-[11px] text-ink-700/50">
                Last ping {formatRelative(responder.lastLocationAt)}
              </p>
            ) : null}
            {responder.currentJob ? (
              <p className="font-medium text-command-600">Mission: {responder.currentJob}</p>
            ) : null}
          </div>
        </Popup>
      </CircleMarker>
    </>
  );
}
