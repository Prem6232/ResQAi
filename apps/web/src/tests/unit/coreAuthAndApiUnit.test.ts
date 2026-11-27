import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeCategory, normalizeUrgency } from "@/lib/api";
import { categoryMeta, incidentStatusMeta, urgencyMeta } from "@/lib/categories";
import { permissionMatrix } from "@/config/permissions.config";
import { routes } from "@/config/routes.config";
import {
  applyWsResponderLocation,
  buildStraightLineRoute,
  haversineDistanceKm,
  isResponderTrackable,
  sanitizeToBhopal,
} from "@/components/maps/liveResponderMapUtils";
import { http } from "@/lib/axios";
import { formatRelative, newId } from "@/lib/utils";
import type { ResponderProfile } from "@/types/responder";

describe("Tier 1 Unit Tests — Frontend Normalizers, Spatial Utils & Axios Interceptors", () => {
  const originalAdapter = http.defaults.adapter;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    http.defaults.adapter = originalAdapter;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("normalizes backend category & urgency aliases to canonical Bhopal UI enums", () => {
    expect(normalizeCategory("fire")).toBe("fire_smoke");
    expect(normalizeCategory("SMOKE")).toBe("fire_smoke");
    expect(normalizeCategory("traffic")).toBe("road_accident");
    expect(normalizeCategory("medical_emergency")).toBe("medical");
    expect(normalizeCategory("sos")).toBe("personal_safety");
    expect(normalizeCategory("harassment")).toBe("personal_safety");
    expect(normalizeCategory("flood")).toBe("water_flood");
    expect(normalizeCategory("hazard")).toBe("hazard");
    expect(normalizeCategory("unlisted_tag")).toBe("other");

    expect(normalizeUrgency("critical")).toBe("critical");
    expect(normalizeUrgency("LOW")).toBe("low");
    expect(normalizeUrgency("unknown_level")).toBe("high");

    expect(Object.keys(categoryMeta)).toEqual([
      "fire_smoke",
      "road_accident",
      "medical",
      "personal_safety",
      "water_flood",
      "hazard",
      "other",
    ]);
    expect(urgencyMeta.critical.label).toBe("Critical");
    expect(incidentStatusMeta.en_route.label).toBe("En route");
  });

  it("validates permission matrix and route builders across all 4 roles", () => {
    expect(permissionMatrix.submitReport).toEqual(["citizen"]);
    expect(permissionMatrix.dispatchOffers).toEqual(["operator"]);
    expect(permissionMatrix.approveResponders).toEqual(["admin"]);
    expect(permissionMatrix.viewAudit).toEqual(["admin", "operator"]);

    expect(routes.citizen.report("rep-1")).toBe("/citizen/reports/rep-1");
    expect(routes.operator.incident("inc-42")).toBe("/operator/incidents/inc-42");
    expect(routes.responder.active).toBe("/responder/active");
    expect(routes.admin.geofence).toBe("/admin/geofence");
  });

  it("computes Bhopal geofence sanitization, Haversine distance, routes, and WS telemetry patches", () => {
    // Legacy Delhi coordinate gets mapped into Bhopal bounds
    const normalized = sanitizeToBhopal({ lat: 28.545, lng: 77.2732, source: "gps" });
    expect(normalized.lat).toBeGreaterThanOrEqual(23.0);
    expect(normalized.lat).toBeLessThanOrEqual(23.5);
    expect(normalized.lng).toBeGreaterThanOrEqual(77.2);
    expect(normalized.lng).toBeLessThanOrEqual(77.7);

    // Zero distance to same point, realistic ~3.5km distance across Bhopal
    expect(haversineDistanceKm({ lat: 23.2599, lng: 77.4126 }, { lat: 23.2599, lng: 77.4126 })).toBe(0);
    const dist = haversineDistanceKm({ lat: 23.2599, lng: 77.4126 }, { lat: 23.2332, lng: 77.4343 });
    expect(dist).toBeGreaterThan(3);
    expect(dist).toBeLessThan(4.5);

    const route = buildStraightLineRoute({ lat: 23.2599, lng: 77.4126 }, { lat: 23.2332, lng: 77.4343 });
    expect(route.source).toBe("campus_graph");
    expect(route.coordinates).toHaveLength(2);
    expect(route.durationMinutes).toBeGreaterThanOrEqual(1);

    const unit: ResponderProfile = {
      id: "resp-f2",
      userId: "usr-f2",
      unitCode: "F-2",
      displayName: "Fire Unit F-2",
      type: "fire_warden",
      status: "available",
      capabilities: ["firefighting"],
      shareLocation: true,
      approved: true,
      lastLocation: { lat: 23.25, lng: 77.41, source: "gps" },
    };
    expect(isResponderTrackable(unit)).toBe(true);
    expect(isResponderTrackable({ ...unit, approved: true })).toBe(true);
    expect(isResponderTrackable({ ...unit, shareLocation: false })).toBe(false);

    const updated = applyWsResponderLocation([unit], {
      id: "ev-loc-1",
      type: "responder.location",
      occurredAt: "2026-11-27T10:00:00Z",
      payload: {
        responderId: "resp-f2",
        lat: 23.241,
        lng: 77.425,
      },
    });
    expect(updated[0].lastLocation?.lat).toBeCloseTo(23.241, 4);
    expect(updated[0].lastLocation?.lng).toBeCloseTo(77.425, 4);
  });

  it("attaches JWT Authorization and X-Request-Id in axios interceptor and tolerates invalid JSON", async () => {
    localStorage.setItem(
      "sg.tokens",
      JSON.stringify({ accessToken: "jwt-test-token", refreshToken: "ref-test", expiresAt: Date.now() + 60000 }),
    );

    let capturedAuth: string | undefined;
    let capturedReqId: string | undefined;
    http.defaults.adapter = async (config) => {
      capturedAuth = String(config.headers?.Authorization ?? "");
      capturedReqId = String(config.headers?.["X-Request-Id"] ?? "");
      return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config };
    };

    const res = await http.get("/health");
    expect(res.data).toEqual({ ok: true });
    expect(capturedAuth).toBe("Bearer jwt-test-token");
    expect(capturedReqId).toBeTruthy();

    // Corrupt localStorage JSON does not crash outgoing unauthenticated probes
    localStorage.setItem("sg.tokens", "{corrupt-json");
    await http.get("/health");
    expect(capturedAuth).toBe("");
  });

  it("formats relative timestamps and generates unique prefixed IDs", () => {
    const nowIso = new Date().toISOString();
    expect(formatRelative(nowIso)).toBe("Just now");
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    expect(formatRelative(twoHoursAgo)).toBe("2 h ago");
    expect(newId("sos")).toMatch(/^sos_/);
  });
});
