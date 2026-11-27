import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

import App from "@/App";
import { http } from "@/lib/axios";
import { queryClient } from "@/lib/query-client";
import { saveDraft } from "@/lib/offline-storage";
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

interface SystemBackendState {
  reports: Array<Record<string, unknown>>;
  incidents: Array<Record<string, unknown>>;
  assignments: Array<Record<string, unknown>>;
  audits: Array<Record<string, unknown>>;
  responders: Array<Record<string, unknown>>;
  drillMode: boolean;
}

function setStoredSession(user: {
  id: string;
  name: string;
  email: string;
  role: "citizen" | "operator" | "responder" | "admin";
}) {
  const tokens = {
    accessToken: `tok-${user.role}`,
    refreshToken: `ref-${user.role}`,
    expiresAt: Date.now() + 3_600_000,
  };
  localStorage.setItem("sg.tokens", JSON.stringify(tokens));
  localStorage.setItem(
    "sg.session",
    JSON.stringify({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: [user.role],
        activeRole: user.role,
        campusName: "Bhopal Metro",
      },
      tokens,
    }),
  );
}

function createSystemAdapter(state: SystemBackendState): AxiosAdapter {
  const users: Record<string, { id: string; email: string; role: string; full_name: string }> = {
    "citizen@campus.demo": { id: "usr-cit", email: "citizen@campus.demo", role: "citizen", full_name: "Meera Citizen" },
    "operator@campus.demo": { id: "usr-op", email: "operator@campus.demo", role: "operator", full_name: "Bhopal Operator" },
    "responder@campus.demo": { id: "usr-resp", email: "responder@campus.demo", role: "responder", full_name: "Crew F-2" },
    "admin@campus.demo": { id: "usr-admin", email: "admin@campus.demo", role: "admin", full_name: "Platform Admin" },
  };

  return async (config: InternalAxiosRequestConfig) => {
    const method = (config.method || "get").toUpperCase();
    const rawUrl = config.url || "/";
    const path = rawUrl.replace(/^https?:\/\/[^/]+/, "").replace(/^\/api\/v1/, "").split("?")[0];
    const body =
      typeof config.data === "string"
        ? (JSON.parse(config.data) as Record<string, unknown>)
        : ((config.data as Record<string, unknown> | undefined) || {});

    const respond = (data: unknown, status = 200) => ({
      data,
      status,
      statusText: status === 201 ? "Created" : "OK",
      headers: {},
      config,
    });

    if (method === "GET" && path === "/health") {
      return respond({ status: "healthy", api: "online" });
    }

    if (method === "POST" && path === "/auth/login") {
      const email = String(body.email || "");
      const u = users[email] ?? users["citizen@campus.demo"];
      state.audits.push({
        id: `aud-${state.audits.length + 1}`,
        actorEmail: u.email,
        action: "LOGIN_SUCCESS",
        target: u.id,
        createdAt: new Date().toISOString(),
        synthetic: state.drillMode,
      });
      return respond({
        access_token: `tok-${u.role}`,
        refresh_token: `ref-${u.role}`,
        expires_in: 3600,
        user: {
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          name: u.full_name,
          role: u.role,
          roles: [u.role],
          activeRole: u.role,
          campusName: "Bhopal Metropolitan Area",
        },
      });
    }

    if (method === "POST" && path === "/citizen/reports") {
      const repId = `rep-${state.reports.length + 1}`;
      const incId = `inc-${state.incidents.length + 1}`;
      const report = {
        id: repId,
        reporterId: "usr-cit",
        createdAt: new Date().toISOString(),
        channel: body.channel || "form",
        category: body.category || "fire_smoke",
        urgency: "critical",
        text: body.text || "Incident reported",
        location: body.location || { lat: 23.2599, lng: 77.4126, source: "gps" },
        locationLabel: body.locationLabel || "MP Nagar Zone I",
        processingState: "ai_complete",
        deliveryState: "received_by_server",
        incidentId: incId,
      };
      state.reports.push(report);
      state.incidents.push({
        id: incId,
        publicCode: `INC-${800 + state.incidents.length}`,
        category: report.category,
        urgency: "critical",
        status: "reported",
        title: "MP Nagar Market Smoke",
        location: report.location,
        locationLabel: report.locationLabel,
        reportIds: [repId],
        createdAt: report.createdAt,
        updatedAt: report.createdAt,
        evidenceLabel: "confirmed_by_operator",
      });
      return respond(report, 201);
    }

    if (method === "GET" && path === "/operator/incidents") {
      return respond(state.incidents);
    }

    if (method === "GET" && /^\/operator\/incidents\/[^/]+$/.test(path)) {
      const id = path.split("/").pop() || "";
      const inc = state.incidents.find((i) => i.id === id) || state.incidents[0];
      return respond({
        incident: inc,
        linkedReports: state.reports,
        evidence: {
          vision: { pipeline: "fire_smoke", finding: "unavailable", adapter: "unavailable" },
          duplicates: [],
        },
        assignments: state.assignments,
        timeline: [],
      });
    }

    if (method === "GET" && /^\/operator\/incidents\/[^/]+\/evidence$/.test(path)) {
      return respond({
        vision: { pipeline: "fire_smoke", finding: "unavailable", adapter: "unavailable" },
        duplicates: [],
      });
    }

    if (method === "GET" && /^\/operator\/incidents\/[^/]+\/recommendations$/.test(path)) {
      return respond([
        {
          responderId: "resp-f2",
          unitCode: "F-2",
          displayName: "Fire Unit F-2",
          responderType: "fire_warden",
          capabilities: ["firefighting"],
          distanceKm: 2.1,
          etaMinutes: 5,
          score: 0.96,
          matchReason: "Closest Bhopal fire unit",
        },
      ]);
    }

    if (method === "GET" && (path === "/operator/responders" || path === "/admin/responders")) {
      return respond(state.responders);
    }

    if (method === "GET" && path === "/operator/settings") {
      return respond({
        autoDispatchEnabled: false,
        clusterRadiusMeters: 150,
        audioAlertsEnabled: false,
        triageWindowMinutes: 30,
        highUrgencyThreshold: 0.8,
      });
    }

    if (method === "GET" && path === "/operator/duplicates") {
      return respond([]);
    }

    if (method === "GET" && path === "/operating-area") {
      return respond({
        id: "area-bhopal",
        name: "Bhopal Metro Zone",
        polygon: [
          [77.3, 23.16],
          [77.53, 23.16],
          [77.53, 23.35],
          [77.3, 23.35],
          [77.3, 23.16],
        ],
        srid: 4326,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
    }

    if (method === "GET" && path === "/routing/route") {
      return respond({
        coordinates: [
          [23.255, 77.415],
          [23.2332, 77.4343],
        ],
        distanceKm: 3.2,
        durationMinutes: 8,
        source: "campus_graph",
        liveTraffic: false,
        guaranteedSafe: false,
      });
    }

    if (method === "POST" && path === "/operator/actions/dispatch") {
      const inc = state.incidents.find((i) => i.id === body.incidentId) || state.incidents[0];
      const asg = {
        id: `asg-${state.assignments.length + 1}`,
        incidentId: inc?.id || "inc-1",
        responderId: body.responderId || "resp-f2",
        slotId: "slot-1",
        status: "offered",
        offeredAt: new Date().toISOString(),
        offerDeadline: new Date(Date.now() + 90000).toISOString(),
        etaMinutes: 5,
        distanceKm: 2.1,
        incident: inc,
      };
      if (inc) inc.status = "assigned";
      state.assignments.push(asg);
      state.audits.push({
        id: `aud-${state.audits.length + 1}`,
        actorEmail: "operator@campus.demo",
        action: "DISPATCH_OFFER",
        target: asg.id,
        createdAt: new Date().toISOString(),
        synthetic: state.drillMode,
      });
      return respond(asg, 201);
    }

    if (method === "GET" && path === "/responder/assignments") {
      return respond(state.assignments.filter((a) => a.status !== "completed"));
    }

    if (method === "GET" && path === "/responder/history") {
      return respond(state.assignments.filter((a) => a.status === "completed"));
    }

    if (method === "GET" && path === "/responder/profile") {
      return respond(state.responders[0]);
    }

    if (method === "POST" && /^\/responder\/offers\/[^/]+\/respond$/.test(path)) {
      const id = path.split("/")[3];
      const asg = state.assignments.find((a) => a.id === id);
      if (asg) asg.status = (body.status as string) || "accepted";
      return respond(asg);
    }

    if (method === "GET" && path === "/analytics/summary") {
      return respond({
        totalIncidents: state.incidents.length,
        activeIncidents: state.incidents.filter((i) => i.status !== "resolved").length,
        resolvedIncidents: state.incidents.filter((i) => i.status === "resolved").length,
        openReportsCount: state.reports.length,
        activeRespondersCount: state.responders.length,
        avgArrivalTimeMinutes: 4.1,
        avgResponseTimeSeconds: 246,
        falseAlarmRate: 0,
        syntheticDrillMode: state.drillMode,
      });
    }

    if (method === "GET" && path === "/admin/audit-logs") {
      return respond({ items: state.audits });
    }

    return respond({});
  };
}

describe("Tier 3 System Testing — Integrated Full App, Routing, Providers & Offline Flow", () => {
  const originalAdapter = http.defaults.adapter;
  const originalWebSocket = globalThis.WebSocket;
  let onlineFlag = true;

  beforeEach(() => {
    queryClient.clear();
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
    queryClient.clear();
    http.defaults.adapter = originalAdapter;
    globalThis.WebSocket = originalWebSocket;
    localStorage.clear();
    mockDraftMap.clear();
    window.history.pushState({}, "", "/");
  });

  it("SYS-1 & SYS-2: Enforces ProtectedRoute redirect, login routing across roles, and RoleBasedRoute RBAC", async () => {
    const state: SystemBackendState = {
      reports: [],
      incidents: [],
      assignments: [],
      audits: [],
      responders: [],
      drillMode: true,
    };
    http.defaults.adapter = createSystemAdapter(state);

    window.history.pushState({}, "", "/operator");
    render(<App />);
    expect(await screen.findByRole("heading", { name: /Sign in/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Continue$/i }));
    expect(await screen.findByText(/Bhopal Grid ready/i)).toBeTruthy();
    expect(screen.getByText(/Fire & Smoke/i)).toBeTruthy();

    cleanup();
    window.history.pushState({}, "", "/admin");
    render(<App />);
    expect(await screen.findByText(/You do not have access/i)).toBeTruthy();
  });

  it("SYS-3: Synchronizes OfflineSyncProvider draft outage queue and reconnect flush into backend", async () => {
    const state: SystemBackendState = {
      reports: [],
      incidents: [],
      assignments: [],
      audits: [],
      responders: [],
      drillMode: true,
    };
    http.defaults.adapter = createSystemAdapter(state);
    setStoredSession({
      id: "usr-cit",
      name: "Meera Citizen",
      email: "citizen@campus.demo",
      role: "citizen",
    });

    onlineFlag = false;
    await saveDraft({
      idempotencyKey: "sys-offline-draft-1",
      createdAt: new Date().toISOString(),
      channel: "form",
      category: "fire_smoke",
      text: "Electrical spark at MP Nagar transformer",
      location: { lat: 23.2332, lng: 77.4343, source: "gps" },
      locationLabel: "MP Nagar Zone I",
    });

    window.history.pushState({}, "", "/citizen");
    render(<App />);
    expect(await screen.findByText(/Offline queue ready/i)).toBeTruthy();

    onlineFlag = true;
    fireEvent(window, new Event("online"));

    await waitFor(() => {
      expect(state.reports).toHaveLength(1);
      expect(state.incidents).toHaveLength(1);
    });
    expect(mockDraftMap.size).toBe(0);
  });

  const sharedState: SystemBackendState = {
    reports: [
      {
        id: "rep-1",
        reporterId: "usr-cit",
        createdAt: new Date().toISOString(),
        channel: "form",
        category: "fire_smoke",
        urgency: "critical",
        text: "Electrical spark at MP Nagar transformer",
        location: { lat: 23.2332, lng: 77.4343, source: "gps" },
        locationLabel: "MP Nagar Zone I",
        processingState: "ai_complete",
        deliveryState: "received_by_server",
        incidentId: "inc-1",
      },
    ],
    incidents: [
      {
        id: "inc-1",
        publicCode: "INC-801",
        category: "fire_smoke",
        urgency: "critical",
        status: "reported",
        title: "MP Nagar Market Smoke",
        location: { lat: 23.2332, lng: 77.4343, source: "gps" },
        locationLabel: "MP Nagar Zone I",
        reportIds: ["rep-1"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        evidenceLabel: "confirmed_by_operator",
      },
    ],
    assignments: [],
    audits: [],
    responders: [
      {
        id: "resp-f2",
        userId: "usr-resp",
        unitCode: "F-2",
        displayName: "Fire Unit F-2",
        responderType: "fire_warden",
        capabilities: ["firefighting"],
        isOnDuty: true,
        availabilityStatus: "available",
        shareLocation: true,
        approved: true,
        lastLocation: { lat: 23.255, lng: 77.415, source: "gps" },
      },
    ],
    drillMode: true,
  };

  it("SYS-4a: Operator reviews incident with degraded AI vision and confirms HITL dispatch", async () => {
    http.defaults.adapter = createSystemAdapter(sharedState);
    setStoredSession({
      id: "usr-op",
      name: "Bhopal Operator",
      email: "operator@campus.demo",
      role: "operator",
    });
    window.history.pushState({}, "", "/operator");
    render(<App />);
    expect((await screen.findAllByText(/MP Nagar Market Smoke/i)).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText(/Manual review continues/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Verify & Dispatch Field Unit/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("Reason"), {
      target: { value: "System test verified fire dispatch" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Confirm$/i }));
    await waitFor(() => expect(sharedState.assignments).toHaveLength(1));
  });

  it("SYS-4b: Responder receives dispatch offer modal in full App and accepts mission", async () => {
    http.defaults.adapter = createSystemAdapter(sharedState);
    setStoredSession({
      id: "usr-resp",
      name: "Crew F-2",
      email: "responder@campus.demo",
      role: "responder",
    });
    window.history.pushState({}, "", "/responder");
    render(<App />);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Accept$/i }));
    await waitFor(() => expect(sharedState.assignments[0].status).toBe("accepted"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("SYS-4c: Admin dashboard reflects propagated incident KPIs and audit count", async () => {
    http.defaults.adapter = createSystemAdapter(sharedState);
    setStoredSession({
      id: "usr-admin",
      name: "Platform Admin",
      email: "admin@campus.demo",
      role: "admin",
    });
    window.history.pushState({}, "", "/admin");
    render(<App />);
    expect(await screen.findByText(/Audit Records/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/1 events/i)).toBeTruthy());
  });
});
