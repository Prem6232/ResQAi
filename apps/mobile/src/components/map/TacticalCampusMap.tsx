import React from "react";
import {
  LeafletMapView,
  LeafletMapViewProps,
  BHOPAL_CENTER,
  BHOPAL_BOUNDS,
  MapIncidentMarker,
  MapResponderMarker,
} from "./LeafletMapView";
import { GeoPoint } from "../../types";

export const CAMPUS_CENTER: GeoPoint = BHOPAL_CENTER;
export { BHOPAL_CENTER, BHOPAL_BOUNDS };
export type { MapIncidentMarker, MapResponderMarker };
export type TacticalCampusMapProps = LeafletMapViewProps;

/**
 * TacticalCampusMap is powered by real Leaflet OpenStreetMap tiles
 * specifically centered on Bhopal City (23.2599° N, 77.4126° E).
 */
export const TacticalCampusMap: React.FC<TacticalCampusMapProps> = (props) => {
  return <LeafletMapView {...props} />;
};

export default TacticalCampusMap;
