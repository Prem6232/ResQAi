import { mapConfig } from "@/config/map.config";

export const syntheticCampusPolygon: [number, number][] = [
  [mapConfig.campusCenter.lat + 0.003, mapConfig.campusCenter.lng - 0.003],
  [mapConfig.campusCenter.lat + 0.003, mapConfig.campusCenter.lng + 0.003],
  [mapConfig.campusCenter.lat - 0.003, mapConfig.campusCenter.lng + 0.003],
  [mapConfig.campusCenter.lat - 0.003, mapConfig.campusCenter.lng - 0.003],
];

export function polygonLatLngToLngLat(points: [number, number][]): number[][] {
  return points.map(([lat, lng]) => [Number(lng.toFixed(6)), Number(lat.toFixed(6))]);
}

export function polygonLngLatToLatLng(points: number[][]): [number, number][] {
  return points
    .filter((pt) => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(Number(pt[0])) && Number.isFinite(Number(pt[1])))
    .map((pt) => [Number(pt[1]), Number(pt[0])]);
}
