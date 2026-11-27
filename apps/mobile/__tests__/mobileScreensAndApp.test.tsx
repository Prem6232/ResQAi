import React from "react";
import { Alert } from "react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("@expo/vector-icons", () => {
  const mockReact = require("react");
  const { Text: mockText } = require("react-native");
  const IconMock = ({ name }: { name?: string }) => mockReact.createElement(mockText, null, name || "icon");
  return {
    Feather: IconMock,
    MaterialCommunityIcons: IconMock,
  };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "Light", Medium: "Medium", Heavy: "Heavy" },
  NotificationFeedbackType: { Success: "Success" },
}));

jest.mock("expo-linear-gradient", () => {
  const mockReact = require("react");
  const { View: mockView } = require("react-native");
  return {
    LinearGradient: ({ children }: { children?: React.ReactNode }) =>
      mockReact.createElement(mockView, null, children),
  };
});

jest.mock("expo-status-bar", () => ({
  StatusBar: () => null,
}));

jest.mock("react-native-safe-area-context", () => {
  const mockReact = require("react");
  const { View: mockView } = require("react-native");
  return {
    SafeAreaProvider: ({ children }: { children?: React.ReactNode }) =>
      mockReact.createElement(mockView, null, children),
    SafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      mockReact.createElement(mockView, null, children),
  };
});

jest.mock("react-native-webview", () => {
  const mockReact = require("react");
  const { View: mockView } = require("react-native");
  return {
    WebView: () => mockReact.createElement(mockView, { testID: "leaflet-webview" }),
  };
});

let mockLocationWatcherCallback: ((coords: { lat: number; lng: number }) => void) | null = null;
const mockLocationWatcherRemove = jest.fn();

jest.mock("../src/services/location", () => ({
  BHOPAL_CITY_FALLBACK: { lat: 23.2599, lng: 77.4126 },
  mobileLocation: {
    getCurrentLocation: jest.fn(async () => ({ lat: 23.2599, lng: 77.4126 })),
    startLiveTracking: jest.fn(async (cb: (coords: { lat: number; lng: number }) => void) => {
      mockLocationWatcherCallback = cb;
      return mockLocationWatcherRemove;
    }),
    requestPermission: jest.fn(async () => true),
    checkPermission: jest.fn(async () => true),
    isRealGPS: jest.fn(() => true),
    getLatest: jest.fn(() => ({ lat: 23.2599, lng: 77.4126 })),
  },
}));

jest.mock("../src/components/modals/PermissionsModal", () => {
  const mockReact = require("react");
  const { View: mockView, Text: mockText } = require("react-native");
  return {
    PermissionsModal: ({ visible, onComplete }: { visible: boolean; onComplete: () => void }) =>
      visible
        ? mockReact.createElement(
            mockView,
            { testID: "permissions-modal" },
            mockReact.createElement(mockText, { onPress: onComplete }, "SkipPermissions")
          )
        : null,
  };
});

import App from "../App";
import { AuthScreen } from "../src/screens/auth/AuthScreen";
import { CitizenHomeScreen } from "../src/screens/citizen/CitizenHomeScreen";
import { ResponderFeedScreen } from "../src/screens/responder/ResponderFeedScreen";
import { ResponderActiveNavScreen } from "../src/screens/responder/ResponderActiveNavScreen";
import { mobileApi } from "../src/services/api";
import { mobileRealtime } from "../src/services/realtime";
import type { ResponderJob } from "../src/types";

describe("Mobile UI Screens & App Integration Tests", () => {
  beforeEach(() => {
    mockLocationWatcherCallback = null;
    jest.restoreAllMocks();
    jest.spyOn(mobileApi, "checkHealth").mockResolvedValue({
      connected: true,
      status: "healthy",
    });
    jest.spyOn(mobileRealtime, "connect").mockImplementation(() => undefined);
    jest.spyOn(mobileRealtime, "disconnect").mockImplementation(() => undefined);
    jest.spyOn(mobileRealtime, "subscribe").mockImplementation(() => () => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    mobileRealtime.disconnect();
    mobileApi.logout();
  });

  it("validates AuthScreen inputs and signs in via 1-tap demo citizen button", async () => {
    const onAuthSuccess = jest.fn();
    const loginSpy = jest.spyOn(mobileApi, "login").mockResolvedValue({
      accessToken: "tok-demo-cit",
      user: {
        id: "u-cit",
        email: "citizen@campus.demo",
        fullName: "Aisha Rahman",
        name: "Aisha Rahman",
        role: "citizen",
      },
    });

    await render(<AuthScreen onAuthSuccess={onAuthSuccess} />);

    await fireEvent.press(screen.getByText("Create Account"));
    await fireEvent.changeText(screen.getByPlaceholderText("e.g. Aisha Rahman"), "Vikram Rao");
    await fireEvent.changeText(screen.getByPlaceholderText("citizen@campus.demo"), "vikram@bhopal.in");
    await fireEvent.changeText(screen.getByPlaceholderText("At least 8 characters"), "short");
    await fireEvent.press(screen.getByText("Create ResQAi Account"));
    expect(screen.getByText(/at least 8 characters/i)).toBeTruthy();

    await fireEvent.press(screen.getByText("Sign In"));
    await fireEvent.press(screen.getByText("Aisha Rahman (Citizen)"));

    await waitFor(() => {
      expect(loginSpy).toHaveBeenCalledWith("citizen@campus.demo", "demo1234");
      expect(onAuthSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ email: "citizen@campus.demo", role: "citizen" }),
        "citizen"
      );
    });
  });

  it("triggers 3-second hold SOS beacon on CitizenHomeScreen", async () => {
    jest.useFakeTimers();
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const sosSpy = jest.spyOn(mobileApi, "triggerSOS").mockResolvedValue({
      id: "rep-sos-1",
      title: "CRITICAL PERSONAL SOS",
      category: "personal_sos",
      timestamp: "Just now",
      status: "received",
      statusLabel: "Received",
      currentStep: 1,
      locationLabel: "Bhopal Central",
      location: { lat: 23.2599, lng: 77.4126 },
    });
    const onReportCreated = jest.fn();
    const onNavigateToReports = jest.fn();

    await render(
      <CitizenHomeScreen
        currentLocation={{ lat: 23.2599, lng: 77.4126 }}
        onReportCreated={onReportCreated}
        onNavigateToReports={onNavigateToReports}
      />
    );

    const sosText = screen.getByText("SOS");
    await fireEvent(sosText, "pressIn");
    await act(async () => {
      jest.advanceTimersByTime(3100);
    });

    await waitFor(() => {
      expect(sosSpy).toHaveBeenCalledWith({ lat: 23.2599, lng: 77.4126 });
      expect(onReportCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "rep-sos-1" }));
      expect(alertSpy).toHaveBeenCalled();
    });
  });

  it("executes ResponderFeedScreen accept and ResponderActiveNavScreen en_route -> arrived + field note", async () => {
    const offer: ResponderJob = {
      id: "asg-mob-1",
      incidentNumber: 402,
      incidentId: "inc-402",
      title: "New Market Transformer Smoke",
      category: "fire_smoke",
      urgency: "critical",
      locationLabel: "New Market, Bhopal",
      location: { lat: 23.255, lng: 77.405 },
      distance: "1.4 km",
      distanceKm: 1.4,
      eta: "4 min",
      etaMinutes: 4,
      timeAgo: "Just now",
      offerDeadline: new Date(Date.now() + 80_000).toISOString(),
      status: "offered",
      aiSummary: "High smoke confidence",
    };

    const onAcceptJob = jest.fn();
    const onDeclineJob = jest.fn();
    const onToggleDuty = jest.fn();

    await render(
      <ResponderFeedScreen
        isOnDuty={true}
        onToggleDuty={onToggleDuty}
        featuredJob={offer}
        resolvedJobs={[]}
        onAcceptJob={onAcceptJob}
        onDeclineJob={onDeclineJob}
        currentLocation={{ lat: 23.2599, lng: 77.4126 }}
      />
    );

    expect(screen.getByText("New Market Transformer Smoke")).toBeTruthy();
    await fireEvent.press(screen.getByText("Accept Mission"));
    expect(onAcceptJob).toHaveBeenCalledWith(offer);

    const statusSpy = jest
      .spyOn(mobileApi, "updateAssignmentStatus")
      .mockResolvedValue({ id: "asg-mob-1", status: "en_route" });
    const noteSpy = jest
      .spyOn(mobileApi, "addAssignmentNotes")
      .mockResolvedValue({ ok: true });
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

    const onMarkEnRoute = jest.fn();
    const onMarkArrived = jest.fn();

    await render(
      <ResponderActiveNavScreen
        activeJob={{ ...offer, status: "accepted" }}
        onMarkEnRoute={onMarkEnRoute}
        onMarkArrived={onMarkArrived}
        currentLocation={{ lat: 23.2599, lng: 77.4126 }}
      />
    );

    await fireEvent.press(screen.getByText("Start En Route Navigation"));
    await waitFor(() => {
      expect(statusSpy).toHaveBeenCalledWith("asg-mob-1", "en_route", expect.any(String));
      expect(onMarkEnRoute).toHaveBeenCalled();
      expect(screen.getByText("Mark Arrived on Scene")).toBeTruthy();
    });

    await fireEvent.press(screen.getByText("Mark Arrived on Scene"));
    await waitFor(() => {
      expect(statusSpy).toHaveBeenCalledWith("asg-mob-1", "arrived", expect.any(String));
      expect(onMarkArrived).toHaveBeenCalled();
    });

    await fireEvent.press(screen.getByText("Add Field Notes"));
    await fireEvent.changeText(
      screen.getByPlaceholderText(/Fire extinguisher deployed/i),
      "Area barricaded near Gate 2"
    );
    await fireEvent.press(screen.getByText("Log Note"));
    await waitFor(() => {
      expect(noteSpy).toHaveBeenCalledWith("asg-mob-1", "Area barricaded near Gate 2");
    });
  });

  it("App prevents GPS movement refetch storms, enforces single-role switch guard, and disconnects WS on logout", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const reportsSpy = jest.spyOn(mobileApi, "getCitizenReports").mockResolvedValue([]);
    jest.spyOn(mobileApi, "getNearbyAlerts").mockResolvedValue([]);
    jest.spyOn(mobileApi, "getContacts").mockResolvedValue([]);
    const connectSpy = jest.spyOn(mobileRealtime, "connect");
    const disconnectSpy = jest.spyOn(mobileRealtime, "disconnect");

    jest.spyOn(mobileApi, "login").mockResolvedValue({
      accessToken: "tok-real-cit",
      user: {
        id: "u-real-1",
        email: "vikram@bhopal.in",
        fullName: "Vikram Real",
        name: "Vikram Real",
        role: "citizen",
      },
    });

    await render(<App />);

    await fireEvent.changeText(await screen.findByPlaceholderText("citizen@campus.demo"), "vikram@bhopal.in");
    await fireEvent.changeText(screen.getByPlaceholderText("At least 8 characters"), "StrongPass123!");
    await fireEvent.press(screen.getByText("Sign In as Citizen"));

    await waitFor(() => {
      expect(screen.getByTestId("permissions-modal")).toBeTruthy();
    });
    await fireEvent.press(screen.getByText("SkipPermissions"));

    const connectCallsAfterLogin = connectSpy.mock.calls.length;
    const reportCallsAfterLogin = reportsSpy.mock.calls.length;

    // Simulate repeated GPS coordinate updates while moving around Bhopal
    await act(async () => {
      mockLocationWatcherCallback?.({ lat: 23.261, lng: 77.413 });
      mockLocationWatcherCallback?.({ lat: 23.262, lng: 77.414 });
    });

    expect(connectSpy).toHaveBeenCalledTimes(connectCallsAfterLogin);
    expect(reportsSpy).toHaveBeenCalledTimes(reportCallsAfterLogin);

    // Open RoleSwitcherModal and tap First Responder App for a non-demo Citizen account
    await fireEvent.press(screen.getByText("CITIZEN"));
    await waitFor(() => {
      expect(screen.getByText("Switch App Role")).toBeTruthy();
    });
    await fireEvent.press(screen.getByText("First Responder App"));
    expect(alertSpy).toHaveBeenCalledWith(
      "Sign Out Required",
      expect.stringContaining("vikram@bhopal.in"),
      expect.any(Array)
    );

    // Re-open RoleSwitcherModal and sign out cleanly; verify socket disconnects
    await fireEvent.press(screen.getByText("CITIZEN"));
    await waitFor(() => {
      expect(screen.getByText("Sign Out / Switch Account")).toBeTruthy();
    });
    await fireEvent.press(screen.getByText("Sign Out / Switch Account"));
    expect(disconnectSpy).toHaveBeenCalled();
    expect(await screen.findByText("Create Account")).toBeTruthy();
  });
});
