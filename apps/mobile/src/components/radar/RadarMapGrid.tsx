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
            title: activeMarkerTitle || "Incident: Fire & Smoke (North Quad)",
            category: "fire_smoke",
            urgency: "high",
            lat: 28.5460,
            lng: 77.2735,
            locationLabel: "Near Science & Tech Hub",
            distanceLabel: etaText ? `ETA: ${etaText}` : "350 m away",
          },
          {
            id: "inc-demo-2",
            title: "Road Obstruction & Hazard",
            category: "road_accident",
            urgency: "medium",
            lat: 28.5440,
            lng: 77.2720,
            locationLabel: "Medical Lane Junction",
            distanceLabel: "600 m away",
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
            lat: 28.5455,
            lng: 77.2735,
            isOnDuty: true,
          },
          {
            id: "resp-a12",
            unitCode: "A-12",
            displayName: "Ambulance Alpha",
            lat: 28.5435,
            lng: 77.2725,
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
