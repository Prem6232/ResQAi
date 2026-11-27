import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CitizenDashboard } from "@/pages/citizen/CitizenDashboard";
import { SOSSubmitPage } from "@/pages/citizen/SOSSubmitPage";
import { DetailedReportPage } from "@/pages/citizen/DetailedReportPage";
import { CitizenAlertsPage } from "@/pages/citizen/CitizenAlertsPage";
import { MyReportsHistoryPage } from "@/pages/citizen/MyReportsHistoryPage";
import { ReportReceiptPage } from "@/pages/citizen/ReportReceiptPage";
import { CitizenContactsPage } from "@/pages/citizen/CitizenContactsPage";
import { SettingsPrivacyPage } from "@/pages/citizen/SettingsPrivacyPage";
import { OfflineSyncProvider } from "@/context/OfflineSyncContext";
import { useSubmitSOS } from "@/features/citizen/hooks/useSubmitSOS";
import type { Report, ReportDraft } from "@/types/report";
import type { WsEvent } from "@/types/websocket";

const {
  mockApi,
  mockCancelReport,
  mockDraftStore,
  mockLiveState,
  mockOnlineState,
  mockLogout,
} = vi.hoisted(() => ({
  mockApi: {
    submitReport: vi.fn(),
    requestMediaUpload: vi.fn(),
    myReports: vi.fn(),
    getReport: vi.fn(),
    alerts: vi.fn(),
    contacts: vi.fn(),
    addContact: vi.fn(),
    deleteContact: vi.fn(),
    requestDataDeletion: vi.fn(),
    getOperatingArea: vi.fn(),
  },
  mockCancelReport: vi.fn(),
  mockDraftStore: { items: [] as ReportDraft[] },
  mockLiveState: {
    events: [] as WsEvent[],
    connected: true,
  },
  mockOnlineState: { online: true },
  mockLogout: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));
vi.mock("@/features/citizen/api/cancelReport", () => ({
  cancelReport: mockCancelReport,
}));
vi.mock("@/lib/offline-storage", () => ({
  saveDraft: vi.fn(async (d: ReportDraft) => {
    mockDraftStore.items = [d, ...mockDraftStore.items.filter((x) => x.idempotencyKey !== d.idempotencyKey)];
  }),
  deleteDraft: vi.fn(async (key: string) => {
    mockDraftStore.items = mockDraftStore.items.filter((x) => x.idempotencyKey !== key);
  }),
  listDrafts: vi.fn(async () => [...mockDraftStore.items]),
}));
vi.mock("@/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => mockOnlineState.online,
}));
vi.mock("@/hooks/useLiveEvents", () => ({
  useLiveEvents: () => mockLiveState,
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "usr-cit-1",
      name: "Aarav Sharma",
      email: "aarav@bhopal.in",
      roles: ["citizen"],
      activeRole: "citizen",
      campusName: "Bhopal Metro",
    },
    logout: mockLogout,
  }),
}));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => <div data-testid="leaflet-map">{children}</div>,
  TileLayer: () => null,
  Marker: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Popup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Polygon: () => null,
  Circle: () => null,
  CircleMarker: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  useMap: () => ({ fitBounds: vi.fn(), setView: vi.fn(), flyTo: vi.fn(), invalidateSize: vi.fn() }),
  useMapEvents: () => null,
}));

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: "rep-101",
    reporterId: "usr-cit-1",
    createdAt: "2026-11-27T08:00:00Z",
    channel: "form",
    category: "water_flood",
    text: "Severe waterlogging near DB Mall underpass",
    location: { lat: 23.2332, lng: 77.4343, source: "gps" },
    locationLabel: "DB Mall Underpass, Bhopal",
    media: [],
    processingState: "received",
    deliveryState: "received_by_server",
    incidentId: "inc-401",
    ...overrides,
  };
}

function renderWithCitizenProviders(ui: ReactNode, initialPath = "/citizen") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OfflineSyncProvider>
        <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>
      </OfflineSyncProvider>
    </QueryClientProvider>
  );
}

describe("Complete Citizen Role Functional & Bugfix Suite", () => {
  beforeEach(() => {
    mockDraftStore.items = [];
    mockLiveState.events = [];
    mockOnlineState.online = true;
    localStorage.clear();

    mockApi.submitReport.mockResolvedValue(makeReport());
    mockApi.requestMediaUpload.mockResolvedValue("media-1");
    mockApi.myReports.mockResolvedValue([makeReport()]);
    mockApi.getReport.mockResolvedValue(makeReport());
    mockApi.alerts.mockResolvedValue([
      {
        id: "alt_INC-402",
        category: "fire_smoke",
        title: "Smoke Plume · VIP Road",
        distanceLabel: "350m away",
        statusLabel: "Responders Assigned",
        tone: "active",
        coarsened: true,
        location: { lat: 23.26, lng: 77.413 },
      },
    ]);
    mockApi.contacts.mockResolvedValue([
      { id: "c-1", name: "Meera Sharma", phone: "+919876543210", relationshipLabel: "Mother" },
    ]);
    mockApi.addContact.mockResolvedValue({ id: "c-2" });
    mockApi.deleteContact.mockResolvedValue({ ok: true });
    mockApi.requestDataDeletion.mockResolvedValue({
      ok: true,
      requestId: "del-req-99",
      status: "queued",
      recordedAt: "2026-11-27T09:00:00Z",
      message: "Deletion request logged for administrator review.",
    });
    mockApi.getOperatingArea.mockResolvedValue({ polygon: [] });
    mockCancelReport.mockResolvedValue(makeReport({ processingState: "cancelled", cancelledReason: "Mistake" }));

    Object.defineProperty(globalThis.navigator, "geolocation", {
      value: {
        getCurrentPosition: (success: (pos: GeolocationPosition) => void) => {
          success({
            coords: { latitude: 23.2611, longitude: 77.4155, accuracy: 9 } as GeolocationCoordinates,
          } as GeolocationPosition);
        },
      },
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders CitizenDashboard with all harmonized Bhopal categories and real grid/GPS status", () => {
    renderWithCitizenProviders(<CitizenDashboard />);

    expect(screen.getByText("Bhopal Grid ready")).toBeTruthy();
    expect(screen.getByText("Water & Flood")).toBeTruthy();
    expect(screen.getByText("Safety hazard")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Hold for three seconds to open SOS confirmation/i })).toBeTruthy();
  });

  it("handles SOSSubmitPage geolocation lock, receipt navigation, and failure alert", async () => {
    mockApi.submitReport.mockRejectedValueOnce(new Error("Gateway timeout"));

    renderWithCitizenProviders(
      <Routes>
        <Route path="/citizen/sos" element={<SOSSubmitPage />} />
        <Route path="/citizen/reports/:id" element={<p>Receipt Route Reached</p>} />
      </Routes>,
      "/citizen/sos"
    );

    expect(screen.getByText(/Bhopal control room/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send SOS now" }));
    expect(await screen.findByText(/Could not send SOS signal/)).toBeTruthy();

    // Retry succeeds with locked GPS coordinates and navigates to receipt
    mockApi.submitReport.mockResolvedValueOnce(makeReport({ id: "rep-sos-1", channel: "sos" }));
    fireEvent.click(screen.getByRole("button", { name: "Send SOS now" }));

    await waitFor(() => {
      expect(mockApi.submitReport).toHaveBeenLastCalledWith(
        expect.objectContaining({
          channel: "sos",
          category: "personal_safety",
          location: expect.objectContaining({ lat: 23.2611, lng: 77.4155, source: "gps" }),
        })
      );
    });
    expect(await screen.findByText("Receipt Route Reached")).toBeTruthy();
  });

  it("completes multi-step DetailedReportPage wizard with Water & Flood category and shows error if submit fails", async () => {
    renderWithCitizenProviders(
      <Routes>
        <Route path="/citizen/report/new" element={<DetailedReportPage />} />
        <Route path="/citizen/reports/:id" element={<p>Wizard Receipt OK</p>} />
      </Routes>,
      "/citizen/report/new?category=water_flood"
    );

    fireEvent.change(screen.getByPlaceholderText(/What is happening/i), {
      target: { value: "Waist-deep storm water on Arera Colony road" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    // Step 2: Media upload
    expect(screen.getByText(/Step 2 of 3/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    // Step 3: Location confirm
    expect(screen.getByText(/Step 3 of 3/i)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Building / landmark name"), {
      target: { value: "Arera Colony Sector E-4" },
    });

    mockApi.submitReport.mockRejectedValueOnce(new Error("Server unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect(await screen.findByText(/Unable to submit incident report/i)).toBeTruthy();

    mockApi.submitReport.mockResolvedValueOnce(makeReport({ id: "rep-202" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    expect(await screen.findByText("Wizard Receipt OK")).toBeTruthy();
  });

  it("queues drafts offline and auto-flushes queued drafts once connectivity returns", async () => {
    function OfflineHarness() {
      const submit = useSubmitSOS();
      return (
        <div>
          <button
            type="button"
            onClick={() =>
              void submit.mutateAsync({
                category: "hazard",
                text: "Downed power cable in Kolar Road",
                location: { lat: 23.18, lng: 77.42, source: "manual_map" },
                locationLabel: "Kolar Road, Bhopal",
                channel: "form",
              })
            }
          >
            Trigger Offline Submit
          </button>
          <MyReportsHistoryPage />
        </div>
      );
    }

    mockOnlineState.online = false;
    const { rerender } = renderWithCitizenProviders(<OfflineHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Trigger Offline Submit" }));
    expect(await screen.findByText("Downed power cable in Kolar Road")).toBeTruthy();
    expect(screen.getByText(/1 pending report queued offline/)).toBeTruthy();

    // Restore connectivity -> useOfflineQueue auto-flushes draft to api.submitReport
    mockOnlineState.online = true;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <OfflineSyncProvider>
          <MemoryRouter>
            <OfflineHarness />
          </MemoryRouter>
        </OfflineSyncProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(mockApi.submitReport).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "hazard",
          text: "Downed power cable in Kolar Road",
          delivered: true,
        })
      );
    });
  });

  it("renders CitizenAlertsPage coarsened alerts and refreshes on WebSocket incident updates", async () => {
    const { rerender } = renderWithCitizenProviders(<CitizenAlertsPage />);

    expect((await screen.findAllByText("Smoke Plume · VIP Road")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/350m away/).length).toBeGreaterThan(0);

    mockApi.alerts.mockResolvedValueOnce([]);
    mockLiveState.events = [
      { id: "ev-1", type: "incident.updated", occurredAt: "2026-11-27T08:10:00Z", payload: {} },
    ];
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <OfflineSyncProvider>
          <MemoryRouter>
            <CitizenAlertsPage />
          </MemoryRouter>
        </OfflineSyncProvider>
      </QueryClientProvider>
    );

    expect(await screen.findByText("No active broadcast notices in your proximity.")).toBeTruthy();
  });

  it("displays Cancelled status in MyReportsHistoryPage and handles cancellation & AppException error in ReportReceiptPage", async () => {
    mockApi.myReports.mockResolvedValueOnce([
      makeReport({ id: "rep-c1", processingState: "cancelled", cancelledReason: "Resolved by security" }),
    ]);
    const histView = renderWithCitizenProviders(<MyReportsHistoryPage />);
    expect(await screen.findByText("Cancelled")).toBeTruthy();
    histView.unmount();

    // ReportReceiptPage surfaces AppException message on dispatched cancellation failure
    mockCancelReport.mockRejectedValueOnce({
      response: { data: { code: "CANNOT_CANCEL_DISPATCHED_INCIDENT", message: "Dispatched incidents cannot be cancelled." } },
    });
    renderWithCitizenProviders(
      <Routes>
        <Route path="/citizen/reports/:id" element={<ReportReceiptPage />} />
      </Routes>,
      "/citizen/reports/rep-101"
    );

    fireEvent.click(await screen.findByRole("button", { name: "Cancel report" }));
    expect(await screen.findByText("Dispatched incidents cannot be cancelled.")).toBeTruthy();
  });

  it("manages contacts with max-3 limit, error display, persisted toggles, and privacy data deletion receipt", async () => {
    mockApi.contacts.mockResolvedValueOnce([
      { id: "c-1", name: "C1", phone: "+911111111111" },
      { id: "c-2", name: "C2", phone: "+912222222222" },
      { id: "c-3", name: "C3", phone: "+913333333333" },
    ]);

    const cView = renderWithCitizenProviders(<CitizenContactsPage />);
    const maxBtn = await screen.findByRole("button", { name: "Maximum 3 trusted contacts reached" });
    expect((maxBtn as HTMLButtonElement).disabled).toBe(true);

    // Toggle persisted localStorage preference
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[1]);
    expect(localStorage.getItem("sg.citizen.sms")).toBe("false");
    cView.unmount();

    // SettingsPrivacyPage logs data deletion receipt
    renderWithCitizenProviders(<SettingsPrivacyPage />);
    fireEvent.change(screen.getByPlaceholderText(/Remove resolved report metadata/i), {
      target: { value: "Clear old drill reports" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Request data deletion" }));
    expect(await screen.findByText(/Ref: del-req-99/)).toBeTruthy();
  });
});
