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
  selfPoint?: GeoPoint;
  incidents?: MapIncidentMarker[];
  responders?: MapResponderMarker[];
  targetIncident?: MapIncidentMarker | null;
  onSelectIncident?: (incident: MapIncidentMarker) => void;
}

export const RadarMapGrid: React.FC<RadarMapGridProps> = ({
  height = 240,
  showRoute = false,
  selfPoint,
  incidents = [],
  responders = [],
  targetIncident,
  onSelectIncident,
}) => {
  return (
    <TacticalCampusMap
      height={height}
      showRoute={showRoute}
      selfPoint={selfPoint}
      incidents={incidents}
      responders={responders}
      targetIncident={targetIncident}
      onSelectIncident={onSelectIncident}
    />
  );
};
