import { api, type OperatingArea } from "@/lib/api";

export function getCampusBoundaries(): Promise<OperatingArea | null> {
  return api.getOperatingArea();
}

export function updateCampusBoundaries(payload: {
  name?: string;
  polygon?: number[][];
  geojson?: { type: "Polygon"; coordinates: number[][][] };
}): Promise<OperatingArea> {
  return api.updateOperatingArea(payload);
}
