import { CampusBaseMap } from "@/components/maps/CampusBaseMap";
import { PerimeterPolygon } from "@/components/maps/PerimeterPolygon";

export function CampusBoundaryEditor() {
  return (
    <div>
      <p className="mb-3 text-sm text-ink-700/70">Synthetic campus polygon (SRID 4326). Editing persists after the API is connected.</p>
      <CampusBaseMap height={360}>
        <PerimeterPolygon />
      </CampusBaseMap>
    </div>
  );
}
