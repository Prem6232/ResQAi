import type { GeoPoint } from "@/types/common";

export async function sendLocationPing(point: GeoPoint) {
  return { ok: true, at: new Date().toISOString(), point };
}
