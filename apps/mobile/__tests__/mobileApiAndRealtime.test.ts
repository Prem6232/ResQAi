import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { mobileApi } from "../src/services/api";
import { mobileRealtime } from "../src/services/realtime";
import { runTextClassifier } from "../src/services/mlBridge";

describe("Mobile API Auth, Refresh Rotation & Realtime Service", () => {
  const originalFetch = global.fetch;
  const originalWebSocket = global.WebSocket;

  beforeEach(() => {
    mobileRealtime.disconnect();
    mobileApi.logout();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    mobileRealtime.disconnect();
    mobileApi.logout();
    global.fetch = originalFetch;
    global.WebSocket = originalWebSocket;
  });

  it("rejects protected API calls when unauthenticated instead of logging into demo credentials", async () => {
    const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;

    await expect(mobileApi.request("/citizen/reports")).rejects.toThrow(/Authentication required/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks non-mobile roles (operator/admin) at mobile login cleanly", async () => {
    global.fetch = (jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "op-tok",
        refresh_token: "op-ref",
        user: { id: "u-op", email: "op@bhopal.in", role: "operator", full_name: "Ops Lead" },
      }),
    })) as unknown) as typeof fetch;

    await expect(mobileApi.login("op@bhopal.in", "Pass1234!")).rejects.toThrow(
      /Citizen and First Responder/i
    );
    expect(mobileApi.getAccessToken()).toBeNull();
  });

  it("rotates tokens via /auth/refresh on HTTP 401 and retries original request", async () => {
    const seenAuthHeaders: string[] = [];
    let callCount = 0;

    global.fetch = (jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers || {}) as Record<string, string>;
      if (url.endsWith("/auth/login")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: "tok-v1",
            refresh_token: "ref-v1",
            user: { id: "u-cit", email: "meera@bhopal.in", role: "citizen", full_name: "Meera" },
          }),
        };
      }
      if (url.endsWith("/citizen/contacts")) {
        seenAuthHeaders.push(headers.Authorization || "");
        callCount += 1;
        if (callCount === 1) {
          return { ok: false, status: 401, text: async () => "Expired" };
        }
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: "c-1", name: "Mom", phone: "+919826000001", is_active: true }],
        };
      }
      if (url.endsWith("/auth/refresh")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: "tok-v2",
            refresh_token: "ref-v2",
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown) as typeof fetch;

    await mobileApi.login("meera@bhopal.in", "Pass1234!");
    const contacts = await mobileApi.getContacts();

    expect(contacts).toHaveLength(1);
    expect(seenAuthHeaders).toEqual(["Bearer tok-v1", "Bearer tok-v2"]);
    expect(mobileApi.getAccessToken()).toBe("tok-v2");
  });

  it("notifies onAuthExpired and clears state on 401 when refresh fails instead of switching to demo user", async () => {
    const expiredSpy = jest.fn();
    const unsub = mobileApi.onAuthExpired(expiredSpy);

    global.fetch = (jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: "tok-user",
            refresh_token: "ref-user",
            user: { id: "u-cit", email: "realuser@bhopal.in", role: "citizen", full_name: "Real User" },
          }),
        };
      }
      if (url.endsWith("/auth/refresh")) {
        return { ok: false, status: 401, text: async () => "Revoked" };
      }
      if (url.endsWith("/citizen/sos")) {
        return { ok: false, status: 401, text: async () => "Unauthorized" };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown) as typeof fetch;

    await mobileApi.login("realuser@bhopal.in", "Pass1234!");
    await expect(mobileApi.triggerSOS({ lat: 23.2599, lng: 77.4126 })).rejects.toThrow(/Session expired/i);

    expect(expiredSpy).toHaveBeenCalledTimes(1);
    expect(mobileApi.getAccessToken()).toBeNull();
    expect(mobileApi.getCurrentUser()).toBeNull();
    unsub();
  });

  it("normalizes legacy Delhi coordinates in citizen reports to Bhopal Metro bounds", async () => {
    global.fetch = (jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: "tok-cit",
            refresh_token: "ref-cit",
            user: { id: "u-cit", email: "c@bhopal.in", role: "citizen", full_name: "Citizen" },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            id: "rep-legacy",
            category: "fire_smoke",
            text: "Smoke near block A",
            location: { lat: 28.545, lng: 77.2732 },
            processing_state: "ai_complete",
            delivery_state: "received_by_server",
            incident_id: "inc-1",
          },
        ],
      };
    }) as unknown) as typeof fetch;

    await mobileApi.login("c@bhopal.in", "Pass1234!");
    const reports = await mobileApi.getCitizenReports();
    expect(reports).toHaveLength(1);
    expect(reports[0].location?.lat).toBeGreaterThanOrEqual(23.0);
    expect(reports[0].location?.lat).toBeLessThanOrEqual(23.5);
    expect(reports[0].location?.lng).toBeGreaterThanOrEqual(77.2);
    expect(reports[0].location?.lng).toBeLessThanOrEqual(77.7);
  });

  it("prevents zombie WebSocket reconnect after explicit disconnect()", async () => {
    const openedUrls: string[] = [];
    const createdSockets: any[] = [];

    class FakeWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      readyState = FakeWebSocket.OPEN;
      onopen: (() => void) | null = null;
      onmessage: ((ev: { data: string }) => void) | null = null;
      onerror: ((err: unknown) => void) | null = null;
      onclose: ((ev: { code: number }) => void) | null = null;
      constructor(url: string) {
        openedUrls.push(url);
        createdSockets.push(this);
      }
      close() {
        this.readyState = FakeWebSocket.CLOSED;
        const fn = this.onclose;
        fn?.({ code: 1000 });
      }
    }

    global.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    // Without token, connect() must not open unauthenticated socket
    mobileRealtime.connect();
    expect(openedUrls).toHaveLength(0);

    mobileApi.setAccessToken("tok-ws-1");
    mobileRealtime.connect();
    expect(openedUrls).toHaveLength(1);
    expect(openedUrls[0]).toContain("token=tok-ws-1");

    jest.useFakeTimers();
    mobileRealtime.disconnect();
    // Simulate async late onclose firing even after disconnect()
    createdSockets[0].onclose?.({ code: 1000 });
    jest.advanceTimersByTime(10_000);
    expect(openedUrls).toHaveLength(1);
    jest.useRealTimers();
  });

  it("wires runTextClassifier to live /citizen/triage-preview and normalizes personal_sos to personal_safety on submit", async () => {
    const bodies: Array<Record<string, any>> = [];

    global.fetch = (jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.body && typeof init.body === "string") {
        bodies.push(JSON.parse(init.body));
      }
      if (url.endsWith("/citizen/triage-preview")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            suggestedCategory: "water_flood",
            suggestedUrgency: "high",
            modelScore: 0.92,
            reviewRequired: false,
            explanation: "Live MuRIL classified Hinglish waterlogging.",
            modelVersion: "muril-indian-emergency-v1-onnx",
          }),
        };
      }
      if (url.endsWith("/citizen/reports")) {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: "rep-mob-sos-1",
            category: "personal_safety",
            deliveryState: "received_by_server",
            locationLabel: "New Market, Bhopal",
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown) as typeof fetch;

    mobileApi.setAccessToken("tok-live-mob");
    const preview = await runTextClassifier("Habibganj underpass me paani bhar gaya");
    expect(preview.suggestedCategory).toBe("water_flood");
    expect(preview.modelConfidence).toBeCloseTo(0.92, 2);

    const created = await mobileApi.createReport({
      category: "personal_sos",
      title: "Personal Safety SOS",
      text: "Emergency near bus stop",
      locationLabel: "New Market, Bhopal",
    });
    expect(created.category).toBe("personal_safety");
    const reportPost = bodies.find((b) => "channel" in b && b.category === "personal_safety");
    expect(reportPost?.category).toBe("personal_safety");
    expect(reportPost?.channel).toBe("sos");

    await mobileApi.createReport({
      category: "fire_smoke",
      title: "Fire Report",
      text: "Transformer fire",
      locationLabel: "MP Nagar",
      voiceTranscript: "Transformer me aag lagi hai",
    });
    const voicePost = bodies.find((b) => b.category === "fire_smoke");
    expect(voicePost?.channel).toBe("voice");
  });
});
