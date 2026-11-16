import { Polygon } from "react-leaflet";
import { mockApi } from "@/lib/mock-api";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { polygonLngLatToLatLng, syntheticCampusPolygon } from "./mapConstants";

export function PerimeterPolygon({ positions }: { positions?: [number, number][] }) {
  const { user } = useAuth();
  const [livePositions, setLivePositions] = useState<[number, number][] | null>(null);

  useEffect(() => {
    if (positions || !user) return;
    let active = true;
    mockApi.getOperatingArea(user.activeRole).then((area) => {
      if (!active || !area?.polygon?.length) return;
      const latLngs = polygonLngLatToLatLng(area.polygon);
      if (latLngs.length >= 3) {
        setLivePositions(latLngs);
      }
    });
    return () => {
      active = false;
    };
  }, [positions, user]);

  return (
    <Polygon
      positions={positions ?? livePositions ?? syntheticCampusPolygon}
      pathOptions={{ color: "#0F8A7A", weight: 2, fillOpacity: 0.06 }}
    />
  );
}
