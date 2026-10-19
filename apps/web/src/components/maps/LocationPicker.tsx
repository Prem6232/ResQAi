import { useMapEvents } from "react-leaflet";
import { CircleMarker } from "react-leaflet";
import type { GeoPoint } from "@/types/common";
import { CampusBaseMap } from "./CampusBaseMap";

function ClickCapture({ onPick }: { onPick: (p: GeoPoint) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng, source: "manual_map" });
    },
  });
  return null;
}

export function LocationPicker({
  value,
  onChange,
}: {
  value: GeoPoint;
  onChange: (p: GeoPoint) => void;
}) {
  return (
    <CampusBaseMap height={260} center={[value.lat, value.lng]}>
      <ClickCapture onPick={onChange} />
      <CircleMarker center={[value.lat, value.lng]} radius={8} pathOptions={{ color: "#C81E1E" }} />
    </CampusBaseMap>
  );
}
