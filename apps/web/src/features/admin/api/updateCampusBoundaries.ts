import { mockApi, type OperatingArea } from "@/lib/mock-api";

export function getCampusBoundaries(): Promise<OperatingArea | null> {
  return mockApi.getOperatingArea();
}

export function updateCampusBoundaries(payload: {
  name?: string;
  polygon?: number[][];
  geojson?: { type: "Polygon"; coordinates: number[][][] };
}): Promise<OperatingArea> {
  return mockApi.updateOperatingArea(payload);
}
