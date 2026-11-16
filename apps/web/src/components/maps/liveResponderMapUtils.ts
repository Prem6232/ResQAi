import type { GeoPoint } from "@/types/common";
import type { RoutePath } from "@/types/geospatial";
import type { ResponderAvailability, ResponderProfile } from "@/types/responder";
import type { WsEvent } from "@/types/websocket";

export interface ResponderStatusTheme {
  label: string;
  color: string;
  fillColor: string;
  pulse: boolean;
  badgeClass: string;
}

export function getResponderStatusTheme(status: ResponderAvailability): ResponderStatusTheme {
  switch (status) {
    case "available":
      return {
        label: "Available",
        color: "#147A4E",
        fillColor: "#1B9A64",
        pulse: true,
        badgeClass: "bg-duty-50 text-duty-600",
      };
    case "busy":
      return {
        label: "Busy / En route",
        color: "#B45309",
        fillColor: "#D97706",
        pulse: true,
        badgeClass: "bg-amber-50 text-amber-800",
      };
    case "off_duty":
      return {
        label: "Off duty",
        color: "#475569",
        fillColor: "#64748B",
        pulse: false,
        badgeClass: "bg-slate-100 text-slate-600",
      };
    case "offline":
    default:
      return {
        label: "Offline",
        color: "#64748B",
        fillColor: "#94A3B8",
        pulse: false,
        badgeClass: "bg-slate-100 text-slate-500",
      };
  }
}

export function isResponderTrackable(responder: ResponderProfile): boolean {
  return Boolean(
    responder.lastLocation &&
      typeof responder.lastLocation.lat === "number" &&
      typeof responder.lastLocation.lng === "number" &&
      responder.shareLocation
  );
}

export function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export function computeGeoBounds(
  points: Array<{ lat: number; lng: number }>
): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;

  for (const pt of points) {
    if (pt.lat < minLat) minLat = pt.lat;
    if (pt.lat > maxLat) maxLat = pt.lat;
    if (pt.lng < minLng) minLng = pt.lng;
    if (pt.lng > maxLng) maxLng = pt.lng;
  }

  if (Math.abs(maxLat - minLat) < 0.0002 && Math.abs(maxLng - minLng) < 0.0002) {
    return null;
  }

  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}

export function haversineDistanceKm(
  a: Pick<GeoPoint, "lat" | "lng">,
  b: Pick<GeoPoint, "lat" | "lng">
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return Number((2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))).toFixed(2));
}

export function applyWsResponderLocation(
  responders: ResponderProfile[],
  event: WsEvent
): ResponderProfile[] {
  const payload = event.payload || {};
  const targetId = String(payload.responderId || payload.responder_id || "");
  if (!targetId) return responders;

  const rawLoc =
    payload.location && typeof payload.location === "object"
      ? (payload.location as Record<string, unknown>)
      : payload;

  const lat = Number(rawLoc.lat);
  const lng = Number(rawLoc.lng);
  const hasValidCoords = Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  const nextStatus = payload.availabilityStatus || payload.availability_status || payload.status;

  let changed = false;
  const next = responders.map((r) => {
    if (r.id !== targetId && r.userId !== targetId) return r;
    changed = true;
    return {
      ...r,
      lastLocation: hasValidCoords
        ? {
            lat,
            lng,
            accuracyMeters: typeof rawLoc.accuracyMeters === "number" ? rawLoc.accuracyMeters : r.lastLocation?.accuracyMeters,
            source: "gps" as const,
          }
        : r.lastLocation,
      lastLocationAt: event.occurredAt || new Date().toISOString(),
      status:
        typeof nextStatus === "string" &&
        ["available", "busy", "off_duty", "offline"].includes(nextStatus)
          ? (nextStatus as ResponderAvailability)
          : r.status,
    };
  });

  return changed ? next : responders;
}

export function buildStraightLineRoute(
  from: Pick<GeoPoint, "lat" | "lng">,
  to: Pick<GeoPoint, "lat" | "lng">,
  durationMinutes?: number,
  distanceKm?: number
): RoutePath {
  const dist = distanceKm ?? haversineDistanceKm(from, to);
  return {
    coordinates: [
      [from.lat, from.lng],
      [to.lat, to.lng],
    ],
    durationMinutes: durationMinutes ?? Math.max(1, Math.round(dist * 3)),
    distanceKm: dist,
    source: "campus_graph",
    liveTraffic: false,
    guaranteedSafe: false,
  };
}

export function parseOsrmGeoJsonRoute(raw: unknown): RoutePath | null {
  if (!raw || typeof raw !== "object") return null;
  const routes = (raw as { routes?: unknown[] }).routes;
  if (!Array.isArray(routes) || routes.length === 0) return null;
  const primary = routes[0] as {
    distance?: number;
    duration?: number;
    geometry?: { coordinates?: unknown[] };
  };
  const rawCoords = primary.geometry?.coordinates;
  if (!Array.isArray(rawCoords) || rawCoords.length < 2) return null;

  const coordinates: [number, number][] = [];
  for (const pt of rawCoords) {
    if (Array.isArray(pt) && pt.length >= 2) {
      const lng = Number(pt[0]);
      const lat = Number(pt[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        coordinates.push([lat, lng]);
      }
    }
  }
  if (coordinates.length < 2) return null;

  const distKm = Number(((Number(primary.distance ?? 0)) / 1000).toFixed(2));
  const durationMinutes = Math.max(1, Math.round(Number(primary.duration ?? 0) / 60));

  return {
    coordinates,
    distanceKm: distKm,
    durationMinutes,
    source: "osrm_baseline",
    liveTraffic: false,
    guaranteedSafe: false,
  };
}

