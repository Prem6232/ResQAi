import { describe, expect, it } from "vitest";
import type { ResponderProfile } from "@/types/responder";
import type { WsEvent } from "@/types/websocket";
import {
  applyWsResponderLocation,
  buildStraightLineRoute,
  computeGeoBounds,
  formatCoordinates,
  getResponderStatusTheme,
  haversineDistanceKm,
  isResponderTrackable,
  parseOsrmGeoJsonRoute,
} from "./liveResponderMapUtils";

const sampleResponder: ResponderProfile = {
  id: "resp-1",
  userId: "user-1",
  unitCode: "F-2",
  displayName: "Rohit Nair",
  type: "fire_warden",
  status: "available",
  capabilities: ["firefighting", "rescue"],
  lastLocation: { lat: 28.5452, lng: 77.2731, source: "gps" },
  shareLocation: true,
  approved: true,
};

describe("liveResponderMapUtils", () => {
  it("returns distinct themes for responder availability statuses", () => {
    expect(getResponderStatusTheme("available").fillColor).toBe("#1B9A64");
    expect(getResponderStatusTheme("busy").fillColor).toBe("#D97706");
    expect(getResponderStatusTheme("offline").pulse).toBe(false);
  });

  it("checks responder trackability cleanly", () => {
    expect(isResponderTrackable(sampleResponder)).toBe(true);
    expect(isResponderTrackable({ ...sampleResponder, shareLocation: false })).toBe(false);
    expect(isResponderTrackable({ ...sampleResponder, lastLocation: undefined })).toBe(false);
  });

  it("merges incoming WebSocket location updates without mutating original array", () => {
    const event: WsEvent = {
      id: "ev-1",
      type: "responder.location",
      occurredAt: "2026-11-16T09:30:00Z",
      payload: {
        responder_id: "resp-1",
        lat: 28.5465,
        lng: 77.2745,
        availability_status: "busy",
      },
    };
    const updated = applyWsResponderLocation([sampleResponder], event);
    expect(updated).not.toBe([sampleResponder]);
    expect(updated[0].lastLocation?.lat).toBe(28.5465);
    expect(updated[0].lastLocation?.lng).toBe(77.2745);
    expect(updated[0].status).toBe("busy");
    expect(sampleResponder.status).toBe("available");
  });

  it("computes bounding box and geodesic distance accurately", () => {
    const bounds = computeGeoBounds([
      { lat: 28.544, lng: 77.271 },
      { lat: 28.548, lng: 77.276 },
    ]);
    expect(bounds).toEqual([
      [28.544, 77.271],
      [28.548, 77.276],
    ]);
    expect(computeGeoBounds([{ lat: 28.544, lng: 77.271 }])).toBeNull();
    expect(formatCoordinates(28.54521, 77.27319)).toBe("28.5452, 77.2732");
    expect(haversineDistanceKm({ lat: 28.5452, lng: 77.2731 }, { lat: 28.5462, lng: 77.2741 })).toBeGreaterThan(0.1);
  });

  it("parses OSRM GeoJSON responses and builds straight-line fallback", () => {
    const parsed = parseOsrmGeoJsonRoute({
      routes: [
        {
          distance: 420,
          duration: 300,
          geometry: {
            coordinates: [
              [77.2731, 28.5452],
              [77.274, 28.546],
              [77.275, 28.547],
            ],
          },
        },
      ],
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.source).toBe("osrm_baseline");
    expect(parsed?.distanceKm).toBe(0.42);
    expect(parsed?.durationMinutes).toBe(5);
    expect(parsed?.coordinates).toEqual([
      [28.5452, 77.2731],
      [28.546, 77.274],
      [28.547, 77.275],
    ]);
    expect(parseOsrmGeoJsonRoute({ routes: [] })).toBeNull();

    const fallback = buildStraightLineRoute(
      { lat: 28.5452, lng: 77.2731 },
      { lat: 28.5482, lng: 77.2761 }
    );
    expect(fallback.source).toBe("campus_graph");
    expect(fallback.coordinates).toHaveLength(2);
    expect(fallback.durationMinutes).toBeGreaterThanOrEqual(1);
  });
});
