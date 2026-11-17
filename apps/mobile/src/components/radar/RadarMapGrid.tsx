import React from "react";
import {
  TacticalCampusMap,
  MapIncidentMarker,
  MapResponderMarker,
} from "../map/TacticalCampusMap";
import { GeoPoint } from "../../types";

interface RadarMapGridProps {
  height?: number;
  showRoute?: boolean;
  activeMarkerTitle?: string;
  etaText?: string;
  selfPoint?: GeoPoint;
  incidents?: MapIncidentMarker[];
  responders?: MapResponderMarker[];
  targetIncident?: MapIncidentMarker | null;
  onSelectIncident?: (incident: MapIncidentMarker) => void;
}

export const RadarMapGrid: React.FC<RadarMapGridProps> = ({
  height = 240,
  showRoute = false,
  activeMarkerTitle,
  etaText,
  selfPoint,
  incidents = [],
  responders = [],
  targetIncident,
  onSelectIncident,
}) => {
  // If no incidents provided, populate realistic campus demo incidents
  const displayIncidents: MapIncidentMarker[] =
    incidents.length > 0
      ? incidents
      : [
          {
            id: "inc-demo-1",
            title: activeMarkerTitle || "Incident: Fire & Smoke (VIP Road)",
            category: "fire_smoke",
            urgency: "high",
            lat: 23.2620,
            lng: 77.4140,
            locationLabel: "VIP Road · Bhopal Lakefront",
            distanceLabel: etaText ? `ETA: ${etaText}` : "450 m away",
          },
          {
            id: "inc-demo-2",
            title: "Road Obstruction & Hazard",
            category: "road_accident",
            urgency: "medium",
            lat: 23.2580,
            lng: 77.4100,
            locationLabel: "MP Nagar Zone-1 Junction",
            distanceLabel: "700 m away",
          },
        ];

  // If no responders provided, populate demo unit
  const displayResponders: MapResponderMarker[] =
    responders.length > 0
      ? responders
      : [
          {
            id: "resp-f2",
            unitCode: "F-2",
            displayName: "Fire Unit F-2",
            lat: 23.2605,
            lng: 77.4130,
            isOnDuty: true,
          },
          {
            id: "resp-a12",
            unitCode: "A-12",
            displayName: "Ambulance Alpha",
            lat: 23.2570,
            lng: 77.4110,
            isOnDuty: true,
          },
        ];

  return (
    <TacticalCampusMap
      height={height}
      showRoute={showRoute}
      selfPoint={selfPoint}
      incidents={displayIncidents}
      responders={displayResponders}
      targetIncident={targetIncident}
      onSelectIncident={onSelectIncident}
    />
  );
};
