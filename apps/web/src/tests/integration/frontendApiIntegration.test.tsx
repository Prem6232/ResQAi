import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

import { AuthProvider } from "@/context/AuthContext";
import { OfflineSyncProvider } from "@/context/OfflineSyncContext";
import { WebSocketProvider } from "@/context/WebSocketContext";
import { useAuth } from "@/hooks/useAuth";
import { useLiveEvents } from "@/hooks/useLiveEvents";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { api } from "@/lib/api";
import { http } from "@/lib/axios";
import { saveDraft } from "@/lib/offline-storage";
import { ResponderApprovalTable } from "@/features/admin/components/ResponderApprovalTable";
import { ResponderTaskView } from "@/pages/responder/ResponderTaskView";
import type { ReportDraft } from "@/types/report";

const { mockDraftMap, stableMap } = vi.hoisted(() => ({
  mockDraftMap: new Map<string, ReportDraft>(),
  stableMap: {
    fitBounds: vi.fn(),
    setView: vi.fn(),
    flyTo: vi.fn(),
    invalidateSize: vi.fn(),
  },
}));

vi.mock("@/lib/offline-storage", () => ({
  saveDraft: vi.fn(async (draft: ReportDraft) => {
    mockDraftMap.set(draft.idempotencyKey, draft);
  }),
  deleteDraft: vi.fn(async (key: string) => {
    mockDraftMap.delete(key);
  }),
  listDrafts: vi.fn(async () => Array.from(mockDraftMap.values())),
}));

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => <div data-testid="leaflet-map">{children}</div>,
  TileLayer: () => null,
  Marker: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Popup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Tooltip: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Polygon: () => null,
  Polyline: () => null,
  Circle: () => null,
  CircleMarker: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  useMap: () => stableMap,
  useMapEvents: () => null,
}));

class MockWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_url: string) {
    queueMicrotask(() => {
      this.onopen?.();
    });
  }
  close() {}
  send() {}
}

describe("Tier 2 Integration Testing — Frontend UI + Real API Client + Axios Interceptors + Storage", () => {
  const originalAdapter = http.defaults.adapter;
  const originalWebSocket = globalThis.WebSocket;
  let onlineFlag = true;

  beforeEach(() => {
    localStorage.clear();
    mockDraftMap.clear();
    onlineFlag = true;
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => onlineFlag,
    });
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    cleanup();
    http.defaults.adapter = originalAdapter;
    globalThis.WebSocket = originalWebSocket;
    localStorage.clear();
    mockDraftMap.clear();
    vi.restoreAllMocks();
  });

  it("INT-1: AuthProvider integrates with real api.login, tolerates corrupt storage, and injects JWT headers", async () => {
    localStorage.setItem("sg.session", "{corrupt-session-json");
    const authHeaders: string[] = [];

    http.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      const path = (config.url || "").replace(/^https?:\/\/[^/]+/, "").replace(/^\/api\/v1/, "");
      authHeaders.push(String(config.headers?.Authorization ?? ""));
      if (config.method === "post" && path === "/auth/login") {
        return {
          data: {
            access_token: "jwt-int-op",
            refresh_token: "ref-int-op",
            expires_in: 3600,
            user: {
              id: "usr-op-99",
              email: "op@bhopal.resqai",
              full_name: "Bhopal Lead",
              role: "operator",
            },
          },
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        };
      }
      if (config.method === "get" && path === "/auth/me") {
        return {
          data: {
            id: "usr-op-99",
            email: "op@bhopal.resqai",
            full_name: "Bhopal Lead",
            role: "operator",
          },
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        };
      }
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    }) as AxiosAdapter;

    function AuthProbe() {
      const { user, login, logout } = useAuth();
      const [meEmail, setMeEmail] = useState("");
      return (
        <div>
          <span data-testid="auth-user">{user ? `${user.name}:${user.activeRole}` : "anonymous"}</span>
          <span data-testid="me-email">{meEmail}</span>
          <button
            type="button"
            onClick={() =>
              void login({ email: "op@bhopal.resqai", password: "Password123!" }).then(async () => {
                const me = await api.getMe();
                setMeEmail(me.email);
              })
            }
          >
            LoginAndFetchMe
          </button>
          <button type="button" onClick={logout}>
            LogoutNow
          </button>
        </div>
      );
    }

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    expect(screen.getByTestId("auth-user").textContent).toBe("anonymous");
    expect(localStorage.getItem("sg.session")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "LoginAndFetchMe" }));
    await waitFor(() => {
      expect(screen.getByTestId("auth-user").textContent).toBe("Bhopal Lead:operator");
      expect(screen.getByTestId("me-email").textContent).toBe("op@bhopal.resqai");
    });
    expect(authHeaders[1]).toBe("Bearer jwt-int-op");

    fireEvent.click(screen.getByRole("button", { name: "LogoutNow" }));
    expect(screen.getByTestId("auth-user").textContent).toBe("anonymous");
    expect(localStorage.getItem("sg.tokens")).toBeNull();
  });

  it("INT-2: Normalizes snake_case DTOs, legacy coordinates, and offline route fallback across api.ts", async () => {
    http.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      const path = (config.url || "").replace(/^https?:\/\/[^/]+/, "").replace(/^\/api\/v1/, "").split("?")[0];
      if (path === "/operator/incidents") {
        return {
          data: [
            {
              id: "inc-legacy-1",
              public_code: "INC-402",
              category: "SMOKE",
              urgency: "critical",
              status: "reported",
              title: "Legacy Smoke Coordinates",
              location: { lat: 28.545, lng: 77.2732, source: "gps" },
              location_label: "New Market Grid",
              report_ids: ["rep-a"],
              evidence_label: "confirmed_by_operator",
              hide_precise_location: false,
            },
          ],
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        };
      }
      if (path === "/operator/responders") {
        return {
          data: [
            {
              id: "resp-1",
              user_id: "usr-r1",
              unit_code: "M-1",
              display_name: "Medic Unit M-1",
              responder_type: "medical_volunteer",
              is_on_duty: true,
              is_approved: true,
              last_location: { lat: 28.5452, lng: 77.2731, source: "gps" },
              user: { full_name: "Dr. Kabir", email: "m1@bhopal.resqai" },
            },
          ],
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        };
      }
      if (path === "/routing/route") {
        throw new Error("OSRM gateway unreachable");
      }
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    }) as AxiosAdapter;

    const [incidents, responders, fallbackRoute] = await Promise.all([
      api.incidents(),
      api.responders(),
      api.fetchRoute({ lat: 23.2599, lng: 77.4126 }, { lat: 23.2332, lng: 77.4343 }, "driving"),
    ]);

    expect(incidents[0].publicCode).toBe("INC-402");
    expect(incidents[0].category).toBe("fire_smoke");
    expect(incidents[0].location.lat).toBeGreaterThanOrEqual(23.0);
    expect(incidents[0].location.lat).toBeLessThanOrEqual(23.5);
    expect(incidents[0].reportIds).toEqual(["rep-a"]);

    expect(responders[0].unitCode).toBe("M-1");
    expect(responders[0].approved).toBe(true);
    expect(responders[0].fullName).toBe("Dr. Kabir");
    expect(responders[0].lastLocation?.lat).toBeLessThanOrEqual(23.5);

    expect(fallbackRoute.source).toBe("campus_graph");
    expect(fallbackRoute.coordinates).toHaveLength(2);
    expect(fallbackRoute.durationMinutes).toBeGreaterThanOrEqual(1);
  });

  it("INT-3: ResponderApprovalTable communicates through getRespondersList and approveResponder to real HTTP contracts", async () => {
    let approvedFlag = false;
    const postedBodies: Array<Record<string, unknown>> = [];

    http.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      const path = (config.url || "").replace(/^https?:\/\/[^/]+/, "").replace(/^\/api\/v1/, "");
      if (config.method === "get" && path === "/admin/responders") {
        return {
          data: [
            {
              id: "resp-v01",
              user_id: "usr-v01",
              unit_code: "V-01",
              display_name: "Volunteer Unit V-01",
              responder_type: "volunteer",
              capabilities: ["first_aid", "rescue"],
              is_on_duty: false,
              is_approved: approvedFlag,
              user: { full_name: "Asha Volunteer", email: "v01@bhopal.resqai" },
            },
          ],
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        };
      }
      if (config.method === "post" && path === "/admin/responders/resp-v01/approve") {
        const parsed = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        postedBodies.push(parsed as Record<string, unknown>);
        approvedFlag = Boolean((parsed as Record<string, unknown>).approved);
        return { data: { id: "resp-v01", approved: approvedFlag }, status: 200, statusText: "OK", headers: {}, config };
      }
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    }) as AxiosAdapter;

    render(<ResponderApprovalTable />);

    expect(await screen.findByText("Asha Volunteer")).toBeTruthy();
    expect(screen.getByText("Pending Review (1)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Approve$/i }));

    await waitFor(() => {
      expect(screen.getByText("Approved (1)")).toBeTruthy();
      expect(screen.getByRole("button", { name: /^Revoke$/i })).toBeTruthy();
    });
    expect(postedBodies[0]).toEqual({ approved: true, approve: true });
  });

  it("INT-4: ResponderTaskView integrates real assignment transitions, notes, and bounded autoPing GPS sync", async () => {
    let status: "accepted" | "en_route" | "arrived" | "completed" = "accepted";
    let routeNote = "";
    let locationPingCount = 0;

    http.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      const path = (config.url || "").replace(/^https?:\/\/[^/]+/, "").replace(/^\/api\/v1/, "").split("?")[0];
      const body = typeof config.data === "string" ? (JSON.parse(config.data) as Record<string, unknown>) : {};
      if (config.method === "get" && path === "/responder/assignments") {
        return {
          data: [
            {
              id: "asg-int-1",
              incident_id: "inc-int-1",
              responder_id: "resp-f2",
              status,
              eta_minutes: 6,
              distance_km: 1.9,
              route_note: routeNote || undefined,
              incident: {
                id: "inc-int-1",
                public_code: "INC-902",
                title: "Habibganj Electrical Fire",
                category: "fire_smoke",
                urgency: "critical",
                status: "assigned",
                location: { lat: 23.2332, lng: 77.4343, source: "gps" },
                location_label: "Habibganj Station Gate 2",
              },
            },
          ],
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        };
      }
      if (config.method === "post" && path === "/responder/assignments/asg-int-1/status") {
        status = (body.status as typeof status) || "en_route";
        return { data: { id: "asg-int-1", status }, status: 200, statusText: "OK", headers: {}, config };
      }
      if (config.method === "post" && path === "/responder/assignments/asg-int-1/notes") {
        routeNote = String(body.notes || "");
        return {
          data: {
            id: "asg-int-1",
            incident_id: "inc-int-1",
            responder_id: "resp-f2",
            status,
            route_note: routeNote,
          },
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        };
      }
      if (config.method === "post" && path === "/responder/location") {
        locationPingCount += 1;
        return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config };
      }
      if (config.method === "get" && path === "/routing/route") {
        return {
          data: {
            coordinates: [
              [23.2599, 77.4126],
              [23.2332, 77.4343],
            ],
            distanceKm: 1.9,
            durationMinutes: 6,
            source: "campus_graph",
          },
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        };
      }
      if (config.method === "get" && path === "/operating-area") {
        return {
          data: {
            id: "area-bhopal",
            name: "Bhopal Metro",
            polygon: [
              [77.3, 23.16],
              [77.53, 23.16],
              [77.53, 23.35],
              [77.3, 23.35],
              [77.3, 23.16],
            ],
          },
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        };
      }
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    }) as AxiosAdapter;

    render(
      <MemoryRouter>
        <AuthProvider>
          <WebSocketProvider>
            <ResponderTaskView />
          </WebSocketProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect((await screen.findAllByText("Habibganj Electrical Fire")).length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: /Start En Route/i }));
    await waitFor(() => {
      expect(status).toBe("en_route");
      expect(locationPingCount).toBe(1);
    });

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(locationPingCount).toBe(1);

    fireEvent.change(screen.getByPlaceholderText(/Append field operational note/i), {
      target: { value: "East gate clear for fire tender" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save note/i }));
    await waitFor(() => expect(routeNote).toBe("East gate clear for fire tender"));
  });

  it("INT-5: OfflineSyncProvider preserves drafts on 503 failure and flushes sequentially once healthy", async () => {
    let failServer = true;
    const submittedPayloads: Array<Record<string, unknown>> = [];

    http.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      const path = (config.url || "").replace(/^https?:\/\/[^/]+/, "").replace(/^\/api\/v1/, "");
      if (config.method === "post" && path === "/citizen/reports") {
        if (failServer) {
          return Promise.reject(new Error("503 Service Unavailable"));
        }
        const parsed = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
        submittedPayloads.push(parsed as Record<string, unknown>);
        return {
          data: {
            id: "rep-sync-1",
            category: "hazard",
            text: "Broken transformer gate",
            processing_state: "received",
            delivery_state: "received_by_server",
          },
          status: 201,
          statusText: "Created",
          headers: {},
          config,
        };
      }
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    }) as AxiosAdapter;

    await saveDraft({
      idempotencyKey: "int-draft-keep-then-flush",
      createdAt: new Date().toISOString(),
      channel: "form",
      category: "hazard",
      text: "Broken transformer gate",
      location: { lat: 23.255, lng: 77.415, source: "gps" },
      locationLabel: "Kolar Link Road",
    });

    function SyncProbe() {
      const { drafts, flushDrafts } = useOfflineSync();
      return (
        <div>
          <span data-testid="draft-count">{drafts.length}</span>
          <button type="button" onClick={() => void flushDrafts()}>
            RetrySyncNow
          </button>
        </div>
      );
    }

    render(
      <OfflineSyncProvider>
        <SyncProbe />
      </OfflineSyncProvider>,
    );

    // Initial mount sees 503 and retains the draft
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(screen.getByTestId("draft-count").textContent).toBe("1");
    expect(mockDraftMap.size).toBe(1);

    // Server recovers -> manual or online retry delivers and removes draft
    failServer = false;
    fireEvent.click(screen.getByRole("button", { name: "RetrySyncNow" }));
    await waitFor(() => expect(screen.getByTestId("draft-count").textContent).toBe("0"));
    expect(mockDraftMap.size).toBe(0);
    expect(submittedPayloads[0].idempotencyKey).toBe("int-draft-keep-then-flush");
    expect(submittedPayloads[0].location_label).toBe("Kolar Link Road");
  });

  it("INT-6: WebSocketProvider detaches superseded socket handlers on token refresh to prevent zombie reconnects", async () => {
    const sockets: Array<{
      url: string;
      closed: boolean;
      onclose: ((ev: { code: number }) => void) | null;
      close: () => void;
    }> = [];

    class TrackingWebSocket {
      url: string;
      closed = false;
      onopen: (() => void) | null = null;
      onmessage: ((ev: { data: string }) => void) | null = null;
      onclose: ((ev: { code: number }) => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(url: string) {
        this.url = url;
        sockets.push(this);
        queueMicrotask(() => {
          this.onopen?.();
        });
      }

      close() {
        this.closed = true;
        const staleHandler = this.onclose;
        queueMicrotask(() => {
          staleHandler?.({ code: 1000 });
        });
      }

      send() {}
    }

    globalThis.WebSocket = TrackingWebSocket as unknown as typeof WebSocket;

    const firstTokens = { accessToken: "tok-v1", refreshToken: "ref-v1", expiresAt: Date.now() + 60_000 };
    localStorage.setItem("sg.tokens", JSON.stringify(firstTokens));
    localStorage.setItem(
      "sg.session",
      JSON.stringify({
        user: {
          id: "usr-op-ws",
          name: "Ops Lead",
          email: "op@bhopal.resqai",
          roles: ["operator"],
          activeRole: "operator",
        },
        tokens: firstTokens,
      }),
    );

    function WsProbe() {
      const { connected } = useLiveEvents();
      return <span data-testid="ws-connected">{connected ? "yes" : "no"}</span>;
    }

    render(
      <AuthProvider>
        <WebSocketProvider>
          <WsProbe />
        </WebSocketProvider>
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("ws-connected").textContent).toBe("yes"));
    expect(sockets).toHaveLength(1);
    expect(sockets[0].url).toContain("tok-v1");

    const nextTokens = { accessToken: "tok-v2", refreshToken: "ref-v2", expiresAt: Date.now() + 60_000 };
    localStorage.setItem("sg.tokens", JSON.stringify(nextTokens));
    localStorage.setItem(
      "sg.session",
      JSON.stringify({
        user: {
          id: "usr-op-ws",
          name: "Ops Lead",
          email: "op@bhopal.resqai",
          roles: ["operator"],
          activeRole: "operator",
        },
        tokens: nextTokens,
      }),
    );
    fireEvent(window, new Event("sg:auth-changed"));

    await waitFor(() => expect(sockets).toHaveLength(2));
    expect(sockets[0].closed).toBe(true);
    expect(sockets[0].onclose).toBeNull();
    await waitFor(() => expect(screen.getByTestId("ws-connected").textContent).toBe("yes"));
    expect(sockets[1].url).toContain("tok-v2");
  });

  it("INT-8: requestMediaUpload executes real PUT to localhost:9000 MinIO URL and IncidentDetailSheet renders voice + boundingBoxes", async () => {
    const { IncidentDetailSheet } = await import("@/features/operator/components/IncidentDetailSheet");
    const putCalls: Array<{ url: string; method?: string }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      putCalls.push({ url: String(input), method: init?.method });
      return { ok: true, status: 200 } as Response;
    }) as unknown) as typeof fetch;

    http.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      const path = (config.url || "").replace(/^https?:\/\/[^/]+/, "").replace(/^\/api\/v1/, "");
      if (config.method === "post" && path === "/media/upload-url") {
        return {
          data: {
            mediaAssetId: "media-loc-1",
            uploadUrl: "http://localhost:9000/sentinelgrid-evidence/evidence/test.jpg?X-Amz-Signature=demo",
          },
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        };
      }
      if (config.method === "post" && path === "/media/media-loc-1/confirm") {
        return { data: { id: "media-loc-1" }, status: 200, statusText: "OK", headers: {}, config };
      }
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    }) as AxiosAdapter;

    try {
      const sampleFile = new File(["img-bytes"], "transformer.jpg", { type: "image/jpeg" });
      const assetId = await api.requestMediaUpload(sampleFile);
      expect(assetId).toBe("media-loc-1");
      expect(putCalls).toHaveLength(1);
      expect(putCalls[0].url).toContain("localhost:9000");
      expect(putCalls[0].method).toBe("PUT");
    } finally {
      globalThis.fetch = originalFetch;
    }

    render(
      <IncidentDetailSheet
        incident={{
          id: "inc-ev-1",
          publicCode: "INC-901",
          category: "fire_smoke",
          urgency: "critical",
          status: "reported",
          title: "MP Nagar Fire",
          location: { lat: 23.231, lng: 77.434, source: "gps" },
          locationLabel: "MP Nagar Zone 2",
          reportIds: ["rep-1"],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          evidenceLabel: "unverified",
          hidePreciseLocationFromPublic: false,
        }}
        detail={{
          incident: {
            id: "inc-ev-1",
            publicCode: "INC-901",
            category: "fire_smoke",
            urgency: "critical",
            status: "reported",
            title: "MP Nagar Fire",
            location: { lat: 23.231, lng: 77.434, source: "gps" },
            locationLabel: "MP Nagar Zone 2",
            reportIds: ["rep-1"],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            evidenceLabel: "unverified",
            hidePreciseLocationFromPublic: false,
          },
          linkedReports: [],
          assignments: [],
          timeline: [],
          evidence: {
            linkedReports: 1,
            temporalConsistency: "aligned",
            locationConsistency: "aligned",
            reusedMediaFlag: false,
            corroboratingVisual: true,
            missing: [],
            conflicting: [],
            voice: {
              transcript: "MP Nagar square pe transformer me aag lagi hai",
              detectedLanguage: "hi-IN (Hindi / Hinglish, 96%)",
              confidence: 0.94,
              modelVersion: "faster-whisper-small-ct2-int8",
            },
            vision: {
              pipeline: "fire_smoke",
              finding: "possible_fire_smoke_evidence",
              modelScore: 0.89,
              modelVersion: "fcos-r50-fpn-indian-fire-smoke-v1-onnx",
              adapter: "live_model",
              explanation: "Detected active_flame across 1 region(s).",
              boundingBoxes: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4, label: "active_flame" }],
            },
            text: {
              suggestedCategory: "fire_smoke",
              suggestedUrgency: "critical",
              modelScore: 0.91,
              scoreMeaning: "Relative classifier score, not probability the incident is real.",
              reviewRequired: true,
              explanation: "Live MuRIL detection.",
              modelVersion: "muril-indian-emergency-v1-onnx",
            },
            duplicates: [],
          },
        }}
      />,
    );

    expect(screen.getByText(/MP Nagar square pe transformer me aag lagi hai/i)).toBeTruthy();
    expect(screen.getByText(/Detections \(1\): active flame/i)).toBeTruthy();
    expect(screen.getByText(/Review Required/i)).toBeTruthy();
  });
});
