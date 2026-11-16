import { http } from "@/lib/axios";
import type { GeoPoint } from "@/types/common";

export async function sendLocationPing(point: GeoPoint) {
  const res = await http.post("/responder/location", {
    lat: point.lat,
    lng: point.lng,
    accuracyMeters: point.accuracyMeters ?? 5.0,
  });
  return res.data;
}
