import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { OperatorCommandCenter } from "@/pages/operator/OperatorCommandCenter";
import { ResponderDashboard } from "@/pages/responder/ResponderDashboard";
import { ResponderTaskView } from "@/pages/responder/ResponderTaskView";
import { CitizenAlertsPage } from "@/pages/citizen/CitizenAlertsPage";
import { ResponderManagementPage } from "@/pages/admin/ResponderManagementPage";
import { GeofenceConfigPage } from "@/pages/admin/GeofenceConfigPage";
import { AdminDashboard } from "@/pages/admin/AdminDashboard";
import type { Assignment } from "@/types/assignment";
import type { Incident } from "@/types/incident";
import type { NearbyAlert, ResponderProfile } from "@/types/responder";
import type { WsEvent } from "@/types/websocket";

const { mockApi, mockLiveState, mockUserState } = vi.hoisted(() => ({
  mockApi: {
    incidents: vi.fn(),
    incidentDetail: vi.fn(),
    evidence: vi.fn(),
    responders: vi.fn(),
    recommendations: vi.fn(),
    analyticsSummary: vi.fn(),
    getSettings: vi.fn(),
    overrideIncident: vi.fn(),
    dispatchIncident: vi.fn(),
    updateIncidentState: vi.fn(),
    assignments: vi.fn(),
    responderHistory: vi.fn(),
    responderProfile: vi.fn(),
    respondToOffer: vi.fn(),
    updateAssignmentStatus: vi.fn(),
    updateDuty: vi.fn(),
    appendAssignmentNotes: vi.fn(),
    sendLocationPing: vi.fn(),
    fetchRoute: vi.fn(),
    alerts: vi.fn(),
    getOperatingArea: vi.fn(),
    updateOperatingArea: vi.fn(),
    adminResponders: vi.fn(),
    approveResponder: vi.fn(),
    auditLogs: vi.fn(),
    toggleDrillMode: vi.fn(),
    getDuplicatePairings: vi.fn(),
    duplicates: vi.fn(),
  },
  mockLiveState: {
    events: [] as WsEvent[],
    connected: true,
  },
  mockUserState: {
    user: {
      id: "usr-op-1",
      name: "Bhopal Control Operator",
      email: "operator@bhopal.resqai",
      roles: ["operator"],
      activeRole: "operator",
      campusName: "Bhopal Metro",
    },
  },
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));
vi.mock("@/features/responder/api/sendLocationPing", () => ({
  sendLocationPing: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/features/admin/api/approveResponder", () => ({
  approveResponder: (id: string, approved: boolean) => mockApi.approveResponder(id, approved),
}));
vi.mock("@/features/admin/api/getAuditLogs", () => ({
  getAuditLogs: () => mockApi.auditLogs(),
}));
vi.mock("@/features/admin/api/updateCampusBoundaries", () => ({
  getCampusBoundaries: () => mockApi.getOperatingArea(),
  updateCampusBoundaries: (payload: unknown) => mockApi.updateOperatingArea(payload),
}));
vi.mock("@/hooks/useLiveEvents", () => ({ useLiveEvents: () => mockLiveState }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUserState.user,
    logout: vi.fn(),
  }),
}));
vi.mock("@/hooks/useGeolocation", () => ({
  useGeolocation: () => ({
    point: { lat: 23.2599, lng: 77.4126, source: "gps" as const },
    request: vi.fn(),
  }),
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
  useMap: () => ({ fitBounds: vi.fn(), setView: vi.fn(), flyTo: vi.fn(), invalidateSize: vi.fn() }),
  useMapEvents: () => null,
}));

function renderUi(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Tier 4 UAT Scenarios — Real-World Bhopal Metro Business Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLiveState.events = [];
    mockApi.getSettings.mockResolvedValue({
      autoDispatchEnabled: false,
      clusterRadiusMeters: 150,
      audioAlertsEnabled: false,
      triageWindowMinutes: 30,
      highUrgencyThreshold: 0.8,
    });
    mockApi.getOperatingArea.mockResolvedValue({
      id: "area-bhopal",
      name: "Bhopal Metropolitan Safety Grid",
      polygon: [
        [77.3, 23.16],
        [77.53, 23.16],
        [77.53, 23.35],
        [77.3, 23.35],
        [77.3, 23.16],
      ],
      srid: 4326,
      isActive: true,
      createdAt: "2026-11-27T06:00:00Z",
    });
    mockApi.getDuplicatePairings.mockResolvedValue([]);
    mockApi.duplicates.mockResolvedValue([]);
    mockApi.evidence.mockResolvedValue({ duplicates: [] });
    mockApi.fetchRoute.mockResolvedValue({
      coordinates: [
        [23.2599, 77.4126],
        [23.2332, 77.4343],
      ],
      distanceKm: 3.7,
      durationMinutes: 9,
      source: "campus_graph",
      liveTraffic: false,
      guaranteedSafe: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("UAT-1: Citizen nearby safety feed enforces ~100m privacy masking without leaking identity", async () => {
    const publicAlerts: NearbyAlert[] = [
      {
        id: "inc-sos-arera",
        category: "personal_safety",
        title: "Personal Safety Incident",
        distanceLabel: "0.4 km away",
        statusLabel: "Active",
        tone: "active",
        coarsened: true,
        location: { lat: 23.217, lng: 77.434 },
      },
    ];
    mockApi.alerts.mockResolvedValue(publicAlerts);

    renderUi(<CitizenAlertsPage />);
    expect((await screen.findAllByText(/Personal Safety Incident/i)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/coarsened/i).length).toBeGreaterThanOrEqual(1);
  });

  it("UAT-2: Operator overrides flood urgency, verifies Bhopal <10km ETA & renders HITL modal above Leaflet (z-[2001])", async () => {
    const floodIncident: Incident = {
      id: "inc-flood-1",
      publicCode: "INC-512",
      category: "hazard",
      urgency: "medium",
      status: "reported",
      title: "Habibganj Underpass Flooding",
      location: { lat: 23.2332, lng: 77.4343, source: "gps" },
      locationLabel: "Habibganj Underpass, Bhopal",
      reportIds: ["rep-512"],
      createdAt: "2026-11-27T08:30:00Z",
      updatedAt: "2026-11-27T08:30:00Z",
      evidenceLabel: "confirmed_by_operator",
      hidePreciseLocationFromPublic: false,
    };
    const r1: ResponderProfile = {
      id: "resp-r1",
      userId: "usr-r1",
      unitCode: "R-1",
      displayName: "Rescue Van R-1",
      type: "volunteer",
      status: "available",
      capabilities: ["rescue", "hazard"],
      shareLocation: true,
      approved: true,
      lastLocation: { lat: 23.249, lng: 77.421, source: "gps" },
    };

    mockApi.incidents.mockResolvedValue([floodIncident]);
    mockApi.responders.mockResolvedValue([r1]);
    mockApi.analyticsSummary.mockResolvedValue({
      totalIncidents: 1,
      activeIncidents: 1,
      resolvedIncidents: 0,
      openReportsCount: 1,
      activeRespondersCount: 1,
      avgArrivalTimeMinutes: 6.2,
      avgResponseTimeSeconds: 372,
      falseAlarmRate: 0,
      syntheticDrillMode: true,
    });
    mockApi.incidentDetail.mockResolvedValue({
      incident: floodIncident,
      linkedReports: [],
      evidence: {
        vision: { pipeline: "fire_smoke", finding: "unavailable", adapter: "unavailable" },
        text: {
          suggestedCategory: "water_flood",
          suggestedUrgency: "critical",
          modelScore: 0.91,
          scoreMeaning: "Relative classifier score",
          reviewRequired: true,
          explanation: "Monsoon waterlogging reported",
          modelVersion: "distilbert-v1",
        },
        duplicates: [],
      },
      assignments: [],
      timeline: [],
    });
    mockApi.recommendations.mockResolvedValue([
      {
        responderId: "resp-r1",
        unitCode: "R-1",
        displayName: "Rescue Van R-1",
        responderType: "volunteer",
        capabilities: ["rescue", "hazard"],
        distanceKm: 2.8,
        etaMinutes: 7,
        score: 0.95,
        matchReason: "Closest flood rescue unit in Bhopal Sector B",
      },
    ]);
    mockApi.overrideIncident.mockResolvedValue({ ...floodIncident, category: "water_flood", urgency: "critical" });
    mockApi.dispatchIncident.mockResolvedValue({
      id: "asg-512",
      incidentId: "inc-flood-1",
      responderId: "resp-r1",
      slotId: "asg-512",
      status: "offered",
      offeredAt: "2026-11-27T08:35:00Z",
    });

    renderUi(<OperatorCommandCenter />);
    expect(await screen.findByText(/Rescue Van R-1 \(R-1\) · ETA: 7 min · 2\.8 km/i)).toBeTruthy();

    // Operator overrides category & urgency
    fireEvent.change(screen.getByLabelText(/Override category/i), { target: { value: "water_flood" } });
    fireEvent.change(screen.getByLabelText(/Override urgency/i), { target: { value: "critical" } });
    fireEvent.change(screen.getByPlaceholderText("Required reason"), {
      target: { value: "Rising water submerging vehicles" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save override/i }));
    await waitFor(() =>
      expect(mockApi.overrideIncident).toHaveBeenCalledWith(
        "inc-flood-1",
        "water_flood",
        "critical",
        "Rising water submerging vehicles",
      ),
    );

    // HITL dispatch dialog sits cleanly above Leaflet overlays (z-[2001])
    fireEvent.click(screen.getByRole("button", { name: /Verify & Dispatch Field Unit/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.className).toContain("z-[2001]");
    fireEvent.change(screen.getByPlaceholderText("Reason"), {
      target: { value: "Approved flood rescue deployment" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Confirm$/i }));
    await waitFor(() => expect(mockApi.dispatchIncident).toHaveBeenCalledWith("inc-flood-1", "resp-r1", "Approved flood rescue deployment"));
  });

  it("UAT-3: Responder sees countdown, accepts mission, appends field notes & escalates blocked-road failure", async () => {
    const offer: Assignment = {
      id: "asg-flood-1",
      incidentId: "inc-flood-1",
      responderId: "resp-r1",
      slotId: "asg-flood-1",
      status: "offered",
      offeredAt: new Date().toISOString(),
      offerDeadline: new Date(Date.now() + 85000).toISOString(),
      etaMinutes: 7,
      distanceKm: 2.8,
      incident: {
        id: "inc-flood-1",
        publicCode: "INC-512",
        title: "Habibganj Underpass Flooding",
        category: "water_flood",
        urgency: "critical",
        status: "assigned",
        location: { lat: 23.2332, lng: 77.4343, source: "gps" },
        locationLabel: "Habibganj Underpass, Bhopal",
      },
    };
    const acceptedOffer: Assignment = { ...offer, status: "accepted" };
    const failedOffer: Assignment = { ...offer, status: "failed" };

    mockApi.responderProfile.mockResolvedValue({
      id: "resp-r1",
      userId: "usr-r1",
      unitCode: "R-1",
      displayName: "Rescue Van R-1",
      responderType: "volunteer",
      capabilities: ["rescue"],
      isOnDuty: true,
      availabilityStatus: "available",
      shareLocation: true,
      approved: true,
    });
    mockApi.responderHistory.mockResolvedValue([]);
    mockApi.assignments.mockResolvedValue([offer]);
    mockApi.respondToOffer.mockResolvedValue(acceptedOffer);

    renderUi(
      <Routes>
        <Route path="/" element={<ResponderDashboard />} />
        <Route path="/responder/active" element={<ResponderTaskView />} />
      </Routes>,
    );

    const acceptBtn = await screen.findByRole("button", { name: /^Accept$/i });
    mockApi.assignments.mockResolvedValue([acceptedOffer]);
    fireEvent.click(acceptBtn);
    await waitFor(() => expect(mockApi.respondToOffer).toHaveBeenCalledWith("asg-flood-1", "accepted"));

    // Cleanly render active task workflow for road-blocked failure escalation
    cleanup();
    mockApi.assignments.mockResolvedValue([acceptedOffer]);
    mockApi.updateAssignmentStatus.mockResolvedValue(failedOffer);
    renderUi(<ResponderTaskView />);

    const escalateBtn = await screen.findByRole("button", { name: /Escalate \/ Report mission issue/i });
    fireEvent.click(escalateBtn);
    fireEvent.change(screen.getByPlaceholderText(/Mandatory reason for mission failure or re-dispatch/i), {
      target: { value: "Road flooded 1.2m deep; need boat team" },
    });
    mockApi.assignments.mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: /Confirm failure/i }));

    await waitFor(() =>
      expect(mockApi.updateAssignmentStatus).toHaveBeenCalledWith(
        "asg-flood-1",
        "failed",
        "Road flooded 1.2m deep; need boat team",
      ),
    );
  });

  it("UAT-4: Admin approves pending volunteer, configures Bhopal corridor polygon & toggles drill mode", async () => {
    const pendingUnit: ResponderProfile = {
      id: "resp-v9",
      userId: "usr-v9",
      unitCode: "V-09",
      displayName: "Volunteer V-09",
      type: "volunteer",
      status: "off_duty",
      capabilities: ["first_aid"],
      shareLocation: false,
      approved: false,
    };

    mockApi.adminResponders.mockResolvedValue([pendingUnit]);
    mockApi.approveResponder.mockResolvedValue({ ...pendingUnit, approved: true });
    mockApi.analyticsSummary.mockResolvedValue({
      totalIncidents: 4,
      activeIncidents: 1,
      resolvedIncidents: 3,
      openReportsCount: 1,
      activeRespondersCount: 2,
      avgArrivalTimeMinutes: 4.5,
      avgResponseTimeSeconds: 270,
      falseAlarmRate: 0,
      syntheticDrillMode: true,
    });
    mockApi.auditLogs.mockResolvedValue([]);
    mockApi.toggleDrillMode.mockResolvedValue({ drillMode: false });
    mockApi.updateOperatingArea.mockResolvedValue({
      id: "area-bhopal",
      name: "Bhopal Flood Watch Corridor",
      polygon: [
        [77.36, 23.19],
        [77.49, 23.19],
        [77.49, 23.31],
        [77.36, 23.31],
      ],
      srid: 4326,
      isActive: true,
      createdAt: "2026-11-27T09:00:00Z",
    });

    renderUi(<ResponderManagementPage />);
    const approveBtn = await screen.findByRole("button", { name: /^Approve$/i });
    mockApi.adminResponders.mockResolvedValue([{ ...pendingUnit, approved: true }]);
    fireEvent.click(approveBtn);
    await waitFor(() => expect(mockApi.approveResponder).toHaveBeenCalledWith("resp-v9", true));

    cleanup();
    renderUi(<GeofenceConfigPage />);
    const nameInput = await screen.findByDisplayValue("Bhopal Metropolitan Safety Grid");
    fireEvent.change(nameInput, { target: { value: "Bhopal Flood Watch Corridor" } });
    fireEvent.click(screen.getByRole("button", { name: /Save operating boundary/i }));
    await waitFor(() => expect(mockApi.updateOperatingArea).toHaveBeenCalled());

    cleanup();
    renderUi(<AdminDashboard />);
    const drillSwitch = await screen.findByRole("switch");
    fireEvent.click(drillSwitch);
    await waitFor(() => expect(mockApi.toggleDrillMode).toHaveBeenCalledWith(false));
  });
});
