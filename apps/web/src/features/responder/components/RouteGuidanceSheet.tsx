import { CampusBaseMap } from "@/components/maps/CampusBaseMap";
import { RoutePolyline } from "@/components/maps/RoutePolyline";
import { mapConfig } from "@/config/map.config";
import type { RoutePath } from "@/types/geospatial";

const demoRoute: RoutePath = {
  coordinates: [
    [mapConfig.campusCenter.lat, mapConfig.campusCenter.lng],
    [mapConfig.campusCenter.lat + 0.0012, mapConfig.campusCenter.lng + 0.001],
  ],
  durationMinutes: 4,
  distanceKm: 0.7,
  source: "demo_adapter",
  liveTraffic: false,
  guaranteedSafe: false,
};

export function RouteGuidanceSheet() {
  return (
    <CampusBaseMap height={280}>
      <RoutePolyline route={demoRoute} />
    </CampusBaseMap>
  );
}
