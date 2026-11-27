import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { OperatorCommandCenter } from "@/pages/operator/OperatorCommandCenter";
import { LiveMapExplorerPage } from "@/pages/operator/LiveMapExplorerPage";
import { OperatorRespondersPage } from "@/pages/operator/OperatorRespondersPage";
import { OperatorAnalyticsPage } from "@/pages/operator/OperatorAnalyticsPage";
import { OperatorSettingsPage } from "@/pages/operator/OperatorSettingsPage";
import { OperatorAuditPage } from "@/pages/operator/OperatorAuditPage";
import { IncidentWorkspacePage } from "@/pages/operator/IncidentWorkspacePage";
import { DuplicateMergeReviewPage } from "@/pages/operator/DuplicateMergeReviewPage";
import { OperatorOverrideControl } from "@/features/operator/components/OperatorOverrideControl";
import { HumanOversightReviewModal } from "@/features/operator/components/HumanOversightReviewModal";

const { mockApi, mockPushToast, mockGetAuditLogs } = vi.hoisted(() => ({
  mockApi: {
    incidents: vi.fn(),
    responders: vi.fn(),
    analyticsSummary: vi.fn(),
    incidentDetail: vi.fn(),
    recommendations: vi.fn(),
    dispatchIncident: vi.fn(),
    updateIncidentState: vi.fn(),
    overrideIncident: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    analyticsHotspots: vi.fn(),
    analyticsByCategory: vi.fn(),
    analyticsResponseTimes: vi.fn(),
    duplicates: vi.fn(),
    mergeReports: vi.fn(),
    evidence: vi.fn(),
    getOperatingArea: vi.fn(),
  },
  mockPushToast: vi.fn(),
  mockGetAuditLogs: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "usr-op-1",
      name: "Bhopal Control Operator",
      email: "operator@bhopal.resqai",
      role: "operator",
      activeRole: "operator",
      campusName: "Bhopal Metro",
    },
    logout: vi.fn(),
  }),
}));
vi.mock("@/hooks/useLiveEvents", () => ({
  useLiveEvents: () => ({ events: [], connected: true }),
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => mockPushToast,
}));
vi.mock("@/lib/audioAlerts", () => ({
  playAlertChime: vi.fn(),
}));
vi.mock("@/features/admin/api/getAuditLogs", () => ({
  getAuditLogs: mockGetAuditLogs,
}));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => <div data-testid="leaflet-map">{children}</div>,
  TileLayer: () => null,
  Marker: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Popup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Polygon: () => null,
  Circle: () => null,
  CircleMarker: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Polyline: () => null,
  Tooltip: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  useMap: () => ({ fitBounds: vi.fn(), setView: vi.fn(), flyTo: vi.fn() }),
}));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div data-testid="chart-container">{children}</div>,
  BarChart: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  LineChart: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Line: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

const sampleIncidents = [
  {
    id: "inc-402",
    publicCode: "INC-402",
    category: "fire_smoke",
    urgency: "critical",
    status: "reported",
    title: "Incident 402 · Fire & Smoke",
    location: { lat: 23.2599, lng: 77.4126 },
    locationLabel: "Market road, Bhopal",
    reportIds: ["rep-1"],
    createdAt: "2026-11-27T08:00:00Z",
    updatedAt: "2026-11-27T08:05:00Z",
    evidenceLabel: "unverified",
    hidePreciseLocationFromPublic: false,
    synthetic: false,
  },
  {
    id: "inc-403",
    publicCode: "INC-403",
    category: "road_accident",
    urgency: "high",
    status: "under_review",
    title: "Road accident",
    location: { lat: 23.2332, lng: 77.4343 },
    locationLabel: "MP Nagar Square, Bhopal",
    reportIds: ["rep-2"],
    createdAt: "2026-11-27T07:50:00Z",
    updatedAt: "2026-11-27T07:55:00Z",
    evidenceLabel: "unverified",
    hidePreciseLocationFromPublic: false,
    synthetic: false,
  },
];

const sampleResponders = [
  {
    id: "resp-f2",
    userId: "usr-f2",
    unitCode: "F-2",
    displayName: "Fire Unit F-2",
    type: "fire_warden",
    status: "available",
    capabilities: ["firefighting", "rescue"],
    lastLocation: { lat: 23.2599, lng: 77.4126, source: "gps" },
    lastLocationAt: "2026-11-27T08:05:00Z",
    shareLocation: true,
    approved: true,
    synthetic: false,
  },
  {
    id: "resp-a12",
    userId: "usr-a12",
    unitCode: "A-12",
    displayName: "Ambulance Unit A-12",
    type: "medical_volunteer",
    status: "busy",
    capabilities: ["first_aid", "rescue"],
    lastLocation: { lat: 23.2332, lng: 77.4343, source: "gps" },
    lastLocationAt: "2026-11-27T08:04:00Z",
    currentJob: "MP Nagar standby",
    shareLocation: true,
    approved: true,
    synthetic: false,
  },
];

const sampleRecommendations = [
  {
    responderId: "resp-f2",
    unitCode: "F-2",
    displayName: "Fire Unit F-2",
    responderType: "fire_warden",
    capabilities: ["firefighting", "rescue"],
    distanceKm: 0.42,
    etaMinutes: 2,
    score: 1.45,
    matchReason: "Equipped for fire smoke: firefighting, rescue",
  },
  {
    responderId: "resp-a12",
    unitCode: "A-12",
    displayName: "Ambulance Unit A-12",
    responderType: "medical_volunteer",
    capabilities: ["first_aid", "rescue"],
    distanceKm: 1.85,
    etaMinutes: 5,
    score: 0.85,
    matchReason: "Medical support unit (Currently on mission)",
  },
];

function renderWithProviders(ui: ReactNode, initialPath = "/operator") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Complete Operator Role Functional & Bugfix Suite", () => {
  beforeEach(() => {
    mockApi.incidents.mockResolvedValue(sampleIncidents);
    mockApi.responders.mockResolvedValue(sampleResponders);
    mockApi.analyticsSummary.mockResolvedValue({
      totalReports: 6,
      openReportsCount: 2,
      activeIncidentsCount: 2,
      activeRespondersCount: 2,
      avgArrivalTimeMinutes: 3.5,
      p95ArrivalTimeMinutes: 6.2,
      falseAlarmRate: 33.3,
      syntheticDrillMode: false,
    });
    mockApi.incidentDetail.mockResolvedValue({
      incident: sampleIncidents[0],
      linkedReports: [
        {
          id: "rep-1",
          text: "Dense smoke near Market road kiosk",
          channel: "form",
          createdAt: "2026-11-27T08:00:00Z",
          processingState: "ai_complete",
          category: "fire_smoke",
          urgency: "critical",
        },
      ],
      evidence: {
        vision: { finding: "unavailable", adapter: "fire_smoke_stub", modelScore: null },
        text: {
          suggestedCategory: "fire_smoke",
          suggestedUrgency: "critical",
          explanation: "High-risk smoke terminology reported in Bhopal Market road.",
        },
        duplicates: [],
      },
      assignments: [],
      timeline: [
        {
          id: "ev-1",
          incidentId: "inc-402",
          from: undefined,
          to: "reported",
          at: "2026-11-27T08:00:00Z",
          actorRole: "citizen",
          note: "Report received",
        },
      ],
    });
    mockApi.recommendations.mockResolvedValue(sampleRecommendations);
    mockApi.dispatchIncident.mockResolvedValue({ id: "asg-1", status: "offered" });
    mockApi.updateIncidentState.mockResolvedValue({ ...sampleIncidents[0], status: "cancelled" });
    mockApi.overrideIncident.mockResolvedValue({ ...sampleIncidents[0], category: "medical", urgency: "critical" });
    mockApi.getSettings.mockResolvedValue({
      autoDispatchEnabled: false,
      audioAlertsEnabled: true,
      clusterRadiusMeters: 150,
      highUrgencyThreshold: 0.8,
      triageWindowMinutes: 30,
    });
    mockApi.updateSettings.mockResolvedValue({
      autoDispatchEnabled: false,
      audioAlertsEnabled: false,
      clusterRadiusMeters: 220,
      highUrgencyThreshold: 0.85,
      triageWindowMinutes: 25,
    });
    mockApi.analyticsHotspots.mockResolvedValue({
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [77.4126, 23.2599] },
          properties: {
            incidentId: "inc-402",
            title: "Market smoke alert",
            category: "fire_smoke",
            urgency: "critical",
            status: "reported",
            weight: 2.0,
          },
        },
      ],
    });
    mockApi.analyticsByCategory.mockResolvedValue({
      categories: [{ name: "fire_smoke", count: 3 }],
    });
    mockApi.analyticsResponseTimes.mockResolvedValue({
      timeline: [{ date: "2026-11-27", count: 4 }],
    });
    mockApi.duplicates.mockResolvedValue([
      {
        incidentIdA: "inc-402",
        incidentIdB: "inc-403",
        score: 0.91,
        recommendation: "merge_recommended",
        signals: ["Within 150m Bhopal cluster", "12 min apart"],
      },
    ]);
    mockApi.mergeReports.mockResolvedValue({ ok: true });
    mockApi.evidence.mockResolvedValue({ duplicates: [] });
    mockApi.getOperatingArea.mockResolvedValue({ polygon: [] });
    mockGetAuditLogs.mockResolvedValue([
      {
        id: "aud-1",
        at: "2026-11-27T08:05:00Z",
        actor: "operator@bhopal.resqai",
        action: "DISPATCH_OFFER",
        target: "inc-402",
        details: { unit_code: "F-2" },
        synthetic: false,
      },
    ]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders OperatorCommandCenter KPIs, isolated map layer, dynamic responder matchReason, and high-z-index HITL modals", async () => {
    const { container } = renderWithProviders(<OperatorCommandCenter />);

    await screen.findByText("Incident 402 · Fire & Smoke");
    expect(screen.getByText("3.5m")).toBeTruthy();
    expect(screen.getByText("33.3%")).toBeTruthy();

    const queueBadge = screen.getByText("2 Active");
    expect(queueBadge.className).toContain("shrink-0");
    expect(queueBadge.className).toContain("whitespace-nowrap");

    // Verify Leaflet map wrapper creates an isolated stacking context under z-0
    expect(container.querySelector(".relative.z-0.isolate")).toBeTruthy();

    // Switching recommended unit updates displayed matchReason instead of staying stuck on topRecommendation
    expect(await screen.findByText(/Equipped for fire smoke/)).toBeTruthy();
    const responderSelect = screen.getByLabelText("Select responder unit for dispatch") as HTMLSelectElement;
    fireEvent.change(responderSelect, { target: { value: "resp-a12" } });
    expect(screen.getByText(/Medical support unit/)).toBeTruthy();

    // Open Dispatch Modal and verify Dialog renders at z-[2000] / z-[2001] above Leaflet zoom controls
    fireEvent.click(screen.getByRole("button", { name: /Verify & Dispatch Field Unit/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.className).toContain("z-[2001]");
    expect(document.querySelector(".z-\\[2000\\]")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Reason"), {
      target: { value: "Dispatched A-12 closest standby medical support" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(mockApi.dispatchIncident).toHaveBeenCalledWith(
        "inc-402",
        "resp-a12",
        "Dispatched A-12 closest standby medical support"
      );
    });
    expect(mockPushToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Dispatch offer sent" })
    );

    // Reopen False Report modal and verify reason field was reset and cancels cleanly
    fireEvent.click(screen.getByRole("button", { name: /Document False \/ Cancelled Report/i }));
    const falseReason = (await screen.findByPlaceholderText("Reason")) as HTMLTextAreaElement;
    expect(falseReason.value).toBe("");
    fireEvent.change(falseReason, { target: { value: "Confirmed false alarm by Bhopal patrol" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(mockApi.updateIncidentState).toHaveBeenCalledWith(
        "inc-402",
        "cancelled",
        "Confirmed false alarm by Bhopal patrol"
      );
    });
  });

  it("keeps HumanOversightReviewModal open with error feedback when async confirm rejects", async () => {
    const failingConfirm = vi.fn().mockRejectedValue(new Error("Dispatch unit offline"));
    renderWithProviders(
      <HumanOversightReviewModal
        open
        title="Confirm Field Assignment Offer"
        onOpenChange={vi.fn()}
        onConfirm={failingConfirm}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("Reason"), { target: { value: "Urgent fire response" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Dispatch unit offline")).toBeTruthy();
  });

  it("allows changing category and urgency in OperatorOverrideControl", async () => {
    const onOverridden = vi.fn();
    renderWithProviders(
      <OperatorOverrideControl
        incidentId="inc-402"
        currentCategory="fire_smoke"
        currentUrgency="high"
        onOverridden={onOverridden}
      />
    );

    fireEvent.change(screen.getByLabelText("Override category"), { target: { value: "medical" } });
    fireEvent.change(screen.getByLabelText("Override urgency"), { target: { value: "critical" } });
    fireEvent.change(screen.getByPlaceholderText("Required reason"), {
      target: { value: "Multiple smoke inhalation injuries reported" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save override" }));

    await waitFor(() => {
      expect(mockApi.overrideIncident).toHaveBeenCalledWith(
        "inc-402",
        "medical",
        "critical",
        "Multiple smoke inhalation injuries reported"
      );
      expect(onOverridden).toHaveBeenCalled();
    });
  });

  it("covers LiveMapExplorerPage, OperatorRespondersPage, OperatorAnalyticsPage, OperatorSettingsPage, OperatorAuditPage, IncidentWorkspacePage, and DuplicateMergeReviewPage", async () => {
    // 1. LiveMapExplorerPage wrapper renders command center
    const liveRender = renderWithProviders(<LiveMapExplorerPage />);
    expect(await screen.findByText("Bhopal Command Center")).toBeTruthy();
    liveRender.unmount();

    // 2. OperatorRespondersPage roster metrics and search filter
    const respRender = renderWithProviders(<OperatorRespondersPage />);
    expect(await screen.findByText("Field Units Roster (2 units)")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Search unit or type..."), { target: { value: "Ambulance" } });
    expect(screen.getByText("Field Units Roster (1 units)")).toBeTruthy();
    respRender.unmount();

    // 3. OperatorAnalyticsPage charts & isolated Bhopal density map
    const anaRender = renderWithProviders(<OperatorAnalyticsPage />);
    expect(await screen.findByText(/Operational Incident Density \(1 Points Tracked\)/)).toBeTruthy();
    expect(anaRender.container.querySelector(".relative.z-0.isolate")).toBeTruthy();
    expect(screen.getByText("Incidents by Emergency Category")).toBeTruthy();
    expect(screen.getByText("Daily Emergency Volume")).toBeTruthy();
    anaRender.unmount();

    // 4. OperatorSettingsPage persists updated cluster radius
    const setRender = renderWithProviders(<OperatorSettingsPage />);
    await waitFor(() => {
      expect(mockApi.getSettings).toHaveBeenCalled();
    });
    fireEvent.change(screen.getByDisplayValue("150"), { target: { value: "220" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Thresholds/i }));
    await waitFor(() => {
      expect(mockApi.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ clusterRadiusMeters: 220 })
      );
    });
    setRender.unmount();

    // 5. OperatorAuditPage renders fetched audit rows
    const audRender = renderWithProviders(<OperatorAuditPage />);
    expect(await screen.findByText(/DISPATCH_OFFER/)).toBeTruthy();
    audRender.unmount();

    // 6. IncidentWorkspacePage loads detailed reports and timeline for route param
    const wsRender = renderWithProviders(
      <Routes>
        <Route path="/operator/incidents/:id" element={<IncidentWorkspacePage />} />
      </Routes>,
      "/operator/incidents/inc-402"
    );
    expect(await screen.findByText("Dense smoke near Market road kiosk")).toBeTruthy();
    expect(screen.getByText(/Text triage:/)).toBeTruthy();
    wsRender.unmount();

    // 7. DuplicateMergeReviewPage lists duplicate candidates and submits merge reason
    renderWithProviders(<DuplicateMergeReviewPage />);
    expect(await screen.findByText(/inc-402 ↔ inc-403/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Merge related reports with reason/i }));
    fireEvent.change(await screen.findByPlaceholderText("Reason for merge"), {
      target: { value: "Confirmed overlapping Market road sightings" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record merge" }));

    await waitFor(() => {
      expect(mockApi.mergeReports).toHaveBeenCalledWith(
        "inc-402",
        ["rep-2"],
        "Confirmed overlapping Market road sightings"
      );
    });
  });
});
