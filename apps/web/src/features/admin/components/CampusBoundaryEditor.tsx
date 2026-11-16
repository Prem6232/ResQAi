import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { Marker, Tooltip, useMapEvents } from "react-leaflet";
import { CampusBaseMap } from "@/components/maps/CampusBaseMap";
import { PerimeterPolygon } from "@/components/maps/PerimeterPolygon";
import {
  polygonLatLngToLngLat,
  polygonLngLatToLatLng,
  syntheticCampusPolygon,
} from "@/components/maps/mapConstants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getCampusBoundaries, updateCampusBoundaries } from "../api/updateCampusBoundaries";

function createVertexIcon(index: number) {
  return L.divIcon({
    className: "sg-vertex-handle",
    html: `<div style="width:18px;height:18px;border-radius:9999px;background:#0F8A7A;border:2px solid #FFFFFF;color:#FFFFFF;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.28);cursor:grab;">${index + 1}</div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function InteractivePolygonLayer({
  positions,
  clickToAdd,
  onChange,
}: {
  positions: [number, number][];
  clickToAdd: boolean;
  onChange: (next: [number, number][]) => void;
}) {
  useMapEvents({
    click(e) {
      if (!clickToAdd) return;
      onChange([...positions, [Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))]]);
    },
  });

  const icons = useMemo(() => positions.map((_, idx) => createVertexIcon(idx)), [positions]);

  return (
    <>
      <PerimeterPolygon positions={positions} />
      {positions.map((pos, idx) => (
        <Marker
          key={`${idx}-${pos[0]}-${pos[1]}`}
          position={pos}
          draggable
          icon={icons[idx]}
          eventHandlers={{
            dragend: (event) => {
              const marker = event.target as L.Marker;
              const latlng = marker.getLatLng();
              const next = positions.map((pt, i) =>
                i === idx ? ([Number(latlng.lat.toFixed(6)), Number(latlng.lng.toFixed(6))] as [number, number]) : pt
              );
              onChange(next);
            },
            contextmenu: () => {
              if (positions.length <= 3) return;
              onChange(positions.filter((_, i) => i !== idx));
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            Vertex {idx + 1} · drag to move{positions.length > 3 ? " · right-click to remove" : ""}
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}

export function CampusBoundaryEditor() {
  const [name, setName] = useState("Northridge Campus");
  const [previewPositions, setPreviewPositions] = useState<[number, number][]>(syntheticCampusPolygon);
  const [coordsText, setCoordsText] = useState(
    JSON.stringify(polygonLatLngToLngLat(syntheticCampusPolygon), null, 2)
  );
  const [clickToAdd, setClickToAdd] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const syncFromPositions = (nextPositions: [number, number][]) => {
    setPreviewPositions(nextPositions);
    setCoordsText(JSON.stringify(polygonLatLngToLngLat(nextPositions), null, 2));
  };

  useEffect(() => {
    getCampusBoundaries().then((area) => {
      if (!area) return;
      setName(area.name);
      if (area.polygon?.length >= 3) {
        const latLngs = polygonLngLatToLatLng(area.polygon);
        // Drop closing duplicate point for clean vertex handles if present
        const openRing =
          latLngs.length > 3 &&
          latLngs[0][0] === latLngs[latLngs.length - 1][0] &&
          latLngs[0][1] === latLngs[latLngs.length - 1][1]
            ? latLngs.slice(0, -1)
            : latLngs;
        syncFromPositions(openRing);
      }
    });
  }, []);

  const handleCoordsTextChange = (raw: string) => {
    setCoordsText(raw);
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const latLngs = polygonLngLatToLatLng(parsed as number[][]);
        if (latLngs.length >= 3) {
          setPreviewPositions(latLngs);
          setError(null);
        }
      }
    } catch {
      // Allow user to type incomplete JSON until save
    }
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(coordsText);
    } catch {
      setError("Coordinates must be valid JSON array of [lng, lat] pairs.");
      return;
    }

    if (!Array.isArray(parsed) || parsed.length < 3) {
      setError("Polygon must contain at least 3 [lng, lat] coordinate pairs.");
      return;
    }

    const polygon = parsed as number[][];
    setSaving(true);
    try {
      const updated = await updateCampusBoundaries({ name: name.trim() || "Campus Geofence", polygon });
      if (updated.polygon?.length >= 3) {
        const latLngs = polygonLngLatToLatLng(updated.polygon);
        const openRing =
          latLngs.length > 3 &&
          latLngs[0][0] === latLngs[latLngs.length - 1][0] &&
          latLngs[0][1] === latLngs[latLngs.length - 1][1]
            ? latLngs.slice(0, -1)
            : latLngs;
        syncFromPositions(openRing);
      }
      setSuccess(`Saved operating area "${updated.name}".`);
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to update operating area polygon.";
      setError(detail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-700/70">
          Click the map to place vertices or drag numbered handles to reshape the geofence. Self-intersecting polygons are rejected by backend PostGIS/Shapely validation.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={clickToAdd ? "command" : "outline"}
            onClick={() => setClickToAdd((prev) => !prev)}
          >
            {clickToAdd ? "Click-to-add ON" : "Click-to-add OFF"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={previewPositions.length <= 3}
            onClick={() => syncFromPositions(previewPositions.slice(0, -1))}
          >
            Undo vertex
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => syncFromPositions(syntheticCampusPolygon)}
          >
            Reset rectangle
          </Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7 overflow-hidden rounded-3xl bg-white p-2 shadow-card">
          <CampusBaseMap height={400} zoom={15}>
            <InteractivePolygonLayer
              positions={previewPositions}
              clickToAdd={clickToAdd}
              onChange={syncFromPositions}
            />
          </CampusBaseMap>
        </div>
        <div className="lg:col-span-5 space-y-3 rounded-3xl bg-white p-5 shadow-card">
          <label className="block text-xs font-medium text-ink-700/70">
            Operating Area Name
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block text-xs font-medium text-ink-700/70">
            Polygon Coordinates ([lng, lat][]) · {previewPositions.length} vertices
            <Textarea
              className="mt-1 font-mono text-xs"
              rows={9}
              value={coordsText}
              onChange={(e) => handleCoordsTextChange(e.target.value)}
            />
          </label>
          {error ? <p className="text-xs text-sos-600">{error}</p> : null}
          {success ? <p className="text-xs text-duty-600">{success}</p> : null}
          <Button variant="command" className="w-full" disabled={saving} onClick={handleSave}>
            {saving ? "Validating & saving…" : "Save campus boundary"}
          </Button>
        </div>
      </div>
    </div>
  );
}
