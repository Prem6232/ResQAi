import { Polyline } from "react-leaflet";
import type { RoutePath } from "@/types/geospatial";

export function RoutePolyline({ route }: { route: RoutePath }) {
  return <Polyline positions={route.coordinates} pathOptions={{ color: "#1D4ED8", weight: 5 }} />;
}
