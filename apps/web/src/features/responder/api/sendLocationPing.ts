import { http } from "@/lib/axios";
import { apiConfig } from "@/config/api.config";
import type { GeoPoint } from "@/types/common";

export async function sendLocationPing(point: GeoPoint) {
  if (apiConfig.useMock) {
    return { ok: true, at: new Date().toISOString(), point };
  }
  const res = await http.post("/responder/location", {
    lat: point.lat,
    lng: point.lng,
    accuracyMeters: 5.0,
  });
  return res.data;
}
