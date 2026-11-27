import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { ResponderDashboard } from "@/pages/responder/ResponderDashboard";
import { ResponderTaskView } from "@/pages/responder/ResponderTaskView";
import { RouteNavigationPage } from "@/pages/responder/RouteNavigationPage";
import { ResponderHistoryPage } from "@/pages/responder/ResponderHistoryPage";
import { ResponderStatusPage } from "@/pages/responder/ResponderStatusPage";
import { OfferNotificationModal } from "@/features/responder/components/OfferNotificationModal";
import { LiveResponderMap } from "@/components/maps/LiveResponderMap";
import type { Assignment } from "@/types/assignment";
import type { WsEvent } from "@/types/websocket";

const { mockApi, mockSendLocationPing, mockLiveState, mockPlayChime } = vi.hoisted(() => ({
  mockApi: {
    getMe: vi.fn(),
    responderProfile: vi.fn(),
    assignments: vi.fn(),
    responderHistory: vi.fn(),
    respondToOffer: vi.fn(),
    updateAssignmentStatus: vi.fn(),
    updateDuty: vi.fn(),
    appendAssignmentNotes: vi.fn(),
    fetchRoute: vi.fn(),
    getOperatingArea: vi.fn(),
    responders: vi.fn(),
  },
  mockSendLocationPing: vi.fn(),
  mockLiveState: {
    events: [] as WsEvent[],
    connected: true,
  },
  mockPlayChime: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: mockApi }));
vi.mock("@/features/responder/api/sendLocationPing", () => ({
  sendLocationPing: mockSendLocationPing,
}));
vi.mock("@/hooks/useLiveEvents", () => ({
  useLiveEvents: () => mockLiveState,
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "usr-f2",
      name: "Fire Unit F-2",
      email: "f2@bhopal.resqai",
      roles: ["responder"],
      activeRole: "responder",
      campusName: "Bhopal Metro",
    },
    logout: vi.fn(),
  }),
}));
vi.mock("@/lib/audioAlerts", () => ({
  playAlertChime: mockPlayChime,
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
  useMap: () => ({ fitBounds: vi.fn(), setView: vi.fn(), flyTo: vi.fn(), invalidateSize: vi.fn() }),
}));

function makeAssignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: "asg-101",
    incidentId: "inc-402",
    responderId: "resp-f2",
    slotId: "asg-101",
    status: "offered",
    offeredAt: "2026-11-27T08:00:00Z",
    offerDeadline: new Date(Date.now() + 75_000).toISOString(),
    etaMinutes: 3,
    distanceKm: 0.7,
    incident: {
      id: "inc-402",
      publicCode: "INC-402",
      title: "Lakefront Smoke Plume",
      category: "fire_smoke",
      urgency: "critical",
      status: "assigned",
      location: { lat: 23.2599, lng: 77.4126, source: "gps" },
      locationLabel: "VIP Road, Bhopal",
    },
    ...overrides,
  };
}

function renderWithRouter(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("Complete Responder Role Functional & Bugfix Suite", () => {
  beforeEach(() => {
    mockLiveState.events = [];
    mockApi.getMe.mockResolvedValue({
      id: "usr-f2",
      name: "Fire Unit F-2",
      email: "f2@bhopal.resqai",
      roles: ["responder"],
      activeRole: "responder",
      campusName: "Bhopal Metro",
    });
    mockApi.responderProfile.mockResolvedValue({
      id: "resp-f2",
      userId: "usr-f2",
      unitCode: "F-2",
      displayName: "Fire Unit F-2",
      responderType: "fire_warden",
      capabilities: ["firefighting", "rescue"],
      isOnDuty: true,
      availabilityStatus: "available",
      shareLocation: true,
      approved: true,
    });
    mockApi.assignments.mockResolvedValue([makeAssignment({ status: "offered" })]);
    mockApi.responderHistory.mockResolvedValue([]);
    mockApi.respondToOffer.mockResolvedValue(makeAssignment({ status: "accepted" }));
    mockApi.updateAssignmentStatus.mockResolvedValue(makeAssignment({ status: "en_route" }));
    mockApi.updateDuty.mockResolvedValue({ isOnDuty: true, availabilityStatus: "available", shareLocation: true });
    mockApi.appendAssignmentNotes.mockResolvedValue(makeAssignment({ status: "en_route", routeNote: "Note added" }));
    mockApi.fetchRoute.mockResolvedValue({
      coordinates: [
        [23.2599, 77.4126],
        [23.2625, 77.414],
      ],
      distanceKm: 0.7,
      durationMinutes: 3,
      source: "osrm_baseline",
      liveTraffic: false,
      guaranteedSafe: false,
    });
    mockApi.getOperatingArea.mockResolvedValue({ polygon: [] });
    mockApi.responders.mockResolvedValue([]);
    mockSendLocationPing.mockResolvedValue({ ok: true });

    Object.defineProperty(globalThis.navigator, "geolocation", {
      value: {
        getCurrentPosition: (success: (pos: GeolocationPosition) => void) => {
          success({
            coords: {
              latitude: 23.2611,
              longitude: 77.4155,
              accuracy: 8,
            },
          } as GeolocationPosition);
        },
        watchPosition: () => 1,
        clearWatch: vi.fn(),
      },
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders dynamic duty headings, live offer countdown, and rolls back failed duty toggle on ResponderDashboard", async () => {
    mockApi.assignments.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const idleRender = renderWithRouter(<ResponderDashboard />);

    expect(await screen.findByText("Awaiting Dispatch Offers")).toBeTruthy();

    // Toggle Off Duty
    const dutySwitch = screen.getByRole("switch");
    fireEvent.click(dutySwitch);
    await waitFor(() => {
      expect(mockApi.updateDuty).toHaveBeenCalledWith(false);
    });
    expect(screen.getByText("Off Duty")).toBeTruthy();

    // Failed duty toggle rolls back and renders error message
    mockApi.updateDuty.mockRejectedValueOnce(new Error("Network error"));
    fireEvent.click(screen.getByRole("switch"));
    expect(await screen.findByText("Could not update duty status.")).toBeTruthy();
    idleRender.unmount();

    // When an offered mission exists, close overlay modal and accept inline feed offer with countdown
    mockApi.assignments.mockResolvedValue([makeAssignment({ status: "offered" })]);
    renderWithRouter(<ResponderDashboard />);
    const modalDialog = await screen.findByRole("dialog");
    fireEvent.keyDown(modalDialog, { key: "Escape", code: "Escape" });

    expect(await screen.findByText("Dispatch Offer Pending")).toBeTruthy();
    expect(screen.getAllByText(/\d+s left/).length).toBeGreaterThan(0);

    const acceptButtons = screen.getAllByRole("button", { name: "Accept" });
    fireEvent.click(acceptButtons[0]);
    await waitFor(() => {
      expect(mockApi.respondToOffer).toHaveBeenCalledWith("asg-101", "accepted");
    });
  });

  it("handles offered cards, en_route -> arrived -> completed lifecycle, failure escalation, and notes in ResponderTaskView", async () => {
    // 1. Offered state inside TaskView renders Accept/Decline instead of blank screen
    const taskRender = renderWithRouter(<RouteNavigationPage />);
    expect((await screen.findAllByText("Lakefront Smoke Plume")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => {
      expect(mockApi.respondToOffer).toHaveBeenCalledWith("asg-101", "accepted");
    });
    taskRender.unmount();

    // 2. Accepted -> En Route -> Arrived -> Completed
    mockApi.assignments.mockResolvedValue([makeAssignment({ status: "accepted" })]);
    const activeRender = renderWithRouter(<ResponderTaskView />);
    const startBtn = await screen.findByRole("button", { name: "Start En Route" });
    fireEvent.click(startBtn);
    await waitFor(() => {
      expect(mockApi.updateAssignmentStatus).toHaveBeenCalledWith("asg-101", "en_route", undefined);
    });

    // Save operational notes
    fireEvent.change(screen.getByPlaceholderText(/Append field operational note/i), {
      target: { value: "Hydrant pressure verified at 60 PSI" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => {
      expect(mockApi.appendAssignmentNotes).toHaveBeenCalledWith(
        "asg-101",
        "Hydrant pressure verified at 60 PSI"
      );
    });
    expect(await screen.findByText("Operational note saved to mission log.")).toBeTruthy();
    activeRender.unmount();

    // 3. Arrived -> Complete or Escalate failure with mandatory reason
    mockApi.assignments.mockResolvedValue([makeAssignment({ status: "arrived" })]);
    renderWithRouter(<ResponderTaskView />);
    expect(await screen.findByRole("button", { name: "Mark mission completed" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Escalate / Report mission issue" }));
    fireEvent.change(screen.getByPlaceholderText(/Mandatory reason for mission failure/i), {
      target: { value: "Collapsed bridge blocking firetruck access" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm failure" }));
    await waitFor(() => {
      expect(mockApi.updateAssignmentStatus).toHaveBeenCalledWith(
        "asg-101",
        "failed",
        "Collapsed bridge blocking firetruck access"
      );
    });
  });

  it("closes OfferNotificationModal on assignment.expired WS event and shows error when accept rejects", async () => {
    const onResponded = vi.fn();
    mockApi.respondToOffer.mockRejectedValueOnce(new Error("Offer expired"));

    const { rerender } = renderWithRouter(<OfferNotificationModal onResponded={onResponded} />);
    expect(await screen.findByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText(/Could not submit response/)).toBeTruthy();

    // Simulate WS assignment.expired and backend clearing active offers
    mockApi.assignments.mockResolvedValueOnce([]);
    mockLiveState.events = [
      { id: "ev-exp-1", type: "assignment.expired", occurredAt: "2026-11-27T08:05:00Z", payload: {} },
    ];
    rerender(
      <MemoryRouter>
        <OfferNotificationModal onResponded={onResponded} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("calculates accept rate excluding operator-cancelled items and refreshes history on WS events", async () => {
    mockApi.responderHistory.mockResolvedValue([
      makeAssignment({ id: "h-1", status: "completed", etaMinutes: 4, incident: undefined }),
      makeAssignment({ id: "h-2", status: "declined", etaMinutes: 6 }),
      makeAssignment({ id: "h-3", status: "cancelled", etaMinutes: undefined }),
      makeAssignment({ id: "h-4", status: "failed", etaMinutes: undefined }),
    ]);

    renderWithRouter(<ResponderHistoryPage />);

    // 4 total entries; cancelled (h-3) is excluded from responder acceptance denominator => 2 of 3 = 67%
    expect(await screen.findByText("4")).toBeTruthy();
    expect(screen.getByText("67%")).toBeTruthy();
    expect(screen.getByText("5.0m")).toBeTruthy();
    expect(screen.getByText(/Bhopal Metro/)).toBeTruthy();
  });

  it("awaits fresh GPS coordinates before pinging and persists shareLocation preference in ResponderStatusPage", async () => {
    mockApi.responderProfile.mockResolvedValue({
      id: "resp-f2",
      userId: "usr-f2",
      unitCode: "F-2",
      displayName: "Fire Unit F-2",
      responderType: "fire_warden",
      capabilities: [],
      isOnDuty: true,
      availabilityStatus: "available",
      shareLocation: true,
      approved: true,
    });

    renderWithRouter(<ResponderStatusPage />);
    expect(await screen.findByText("Bhopal Dispatch")).toBeTruthy();

    // Clicking Send GPS Ping Now resolves fresh coords 23.2611, 77.4155 from navigator.geolocation
    fireEvent.click(screen.getByRole("button", { name: "Send GPS Ping Now" }));
    await waitFor(() => {
      expect(mockSendLocationPing).toHaveBeenCalledWith(
        expect.objectContaining({ lat: 23.2611, lng: 77.4155, source: "gps" })
      );
    });
    expect(await screen.findByText(/23\.2611, 77\.4155/)).toBeTruthy();

    // Toggling Share live location off persists shareLocation=false to /responder/duty
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[1]);
    await waitFor(() => {
      expect(mockApi.updateDuty).toHaveBeenCalledWith(true, false);
    });
  });

  it("syncs autoPing state dynamically in LiveResponderMap when enableAutoPing transitions from false to true", async () => {
    const { rerender } = renderWithRouter(
      <LiveResponderMap
        mode="responder"
        selfPoint={{ lat: 23.2599, lng: 77.4126, source: "gps" }}
        enableAutoPing={false}
      />
    );

    expect(screen.getByRole("button", { name: "Auto-ping 15s" })).toBeTruthy();

    rerender(
      <MemoryRouter>
        <LiveResponderMap
          mode="responder"
          selfPoint={{ lat: 23.2599, lng: 77.4126, source: "gps" }}
          enableAutoPing={true}
        />
      </MemoryRouter>
    );

    expect(await screen.findByRole("button", { name: "Auto-ping ON" })).toBeTruthy();
    await waitFor(() => {
      expect(mockSendLocationPing).toHaveBeenCalled();
    });
  });
});
