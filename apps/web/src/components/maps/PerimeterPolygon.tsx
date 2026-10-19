import { Polygon } from "react-leaflet";
import { mapConfig } from "@/config/map.config";

export const syntheticCampusPolygon: [number, number][] = [
  [mapConfig.campusCenter.lat + 0.003, mapConfig.campusCenter.lng - 0.003],
  [mapConfig.campusCenter.lat + 0.003, mapConfig.campusCenter.lng + 0.003],
  [mapConfig.campusCenter.lat - 0.003, mapConfig.campusCenter.lng + 0.003],
  [mapConfig.campusCenter.lat - 0.003, mapConfig.campusCenter.lng - 0.003],
];

export function PerimeterPolygon() {
  return (
    <Polygon
      positions={syntheticCampusPolygon}
      pathOptions={{ color: "#0F8A7A", weight: 1, fillOpacity: 0.04 }}
    />
  );
}
