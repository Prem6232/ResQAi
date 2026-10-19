import type { ReactNode } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { mapConfig } from "@/config/map.config";
import type { LatLngExpression } from "leaflet";

export function CampusBaseMap({
  children,
  height = 220,
  zoom = mapConfig.defaultZoom,
  center,
}: {
  children?: ReactNode;
  height?: number;
  zoom?: number;
  center?: LatLngExpression;
}) {
  return (
    <div className="overflow-hidden rounded-3xl" style={{ height }}>
      <MapContainer
        center={center ?? [mapConfig.campusCenter.lat, mapConfig.campusCenter.lng]}
        zoom={zoom}
        className="h-full w-full"
        scrollWheelZoom={false}
        attributionControl
      >
        <TileLayer url={mapConfig.tileUrl} attribution={mapConfig.attribution} />
        {children}
      </MapContainer>
    </div>
  );
}
