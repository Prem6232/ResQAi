import { afterEach, describe, expect, it, vi } from "vitest";
import { http } from "@/lib/axios";
import { api } from "@/lib/api";
import { getAuditLogs } from "@/features/admin/api/getAuditLogs";
import { polygonLatLngToLngLat, polygonLngLatToLatLng } from "@/components/maps/mapConstants";

describe("Admin Geofence, Drill Mode & Audit Log Suite", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps audit logs with details, IP address, and defaults synthetic to false", async () => {
    const getSpy = vi.spyOn(http, "get").mockResolvedValue({
      data: {
        items: [
          {
            id: "log-1",
            createdAt: "2026-11-27T08:00:00Z",
            actorEmail: "admin@campus.demo",
            action: "APPROVE_RESPONDER",
            target: "ResponderProfile:resp-1",
            details: { unit_code: "F-2", approved: true },
            ipAddress: "103.21.44.10",
          },
        ],
      },
    } as never);

    const rows = await getAuditLogs();
    expect(getSpy).toHaveBeenCalledWith("/admin/audit-logs");
    expect(rows).toHaveLength(1);
    expect(rows[0].synthetic).toBe(false);
    expect(rows[0].details).toEqual({ unit_code: "F-2", approved: true });
    expect(rows[0].ipAddress).toBe("103.21.44.10");
  });

  it("round-trips Bhopal Metropolitan Safety Grid coordinates between Leaflet and GeoJSON", () => {
    const bhopalLatLng: [number, number][] = [
      [23.16, 77.3],
      [23.16, 77.53],
      [23.35, 77.53],
      [23.35, 77.3],
    ];

    const geoJson = polygonLatLngToLngLat(bhopalLatLng);
    expect(geoJson[0]).toEqual([77.3, 23.16]);
    expect(geoJson[2]).toEqual([77.53, 23.35]);

    const restored = polygonLngLatToLatLng(geoJson);
    expect(restored).toEqual(bhopalLatLng);
  });

  it("persists drill mode state via POST /admin/drill-mode", async () => {
    const postSpy = vi.spyOn(http, "post").mockResolvedValue({
      data: { ok: true, drillMode: false },
    } as never);

    const res = await api.toggleDrillMode(false);
    expect(postSpy).toHaveBeenCalledWith("/admin/drill-mode", {
      enabled: false,
      drillMode: false,
    });
    expect(res).toEqual({ ok: true, drillMode: false });
  });
});
