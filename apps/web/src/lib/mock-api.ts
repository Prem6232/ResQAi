import { apiConfig } from "@/config/api.config";
import type { LoginPayload, RegisterPayload, SessionUser } from "@/types/auth";
import type { IncidentCategory } from "@/types/incident";
import type { GeoPoint } from "@/types/common";
import {
  addCitizenReport,
  demoUsers,
  healthPayload,
  mockAssignments,
  mockEvidence,
  mockIncidents,
  mockReports,
  mockResponders,
  nearbyAlerts,
} from "./mock-store";

const delay = (ms = 280) => new Promise((r) => setTimeout(r, ms));

export const mockApi = {
  async health() {
    await delay(120);
    return healthPayload();
  },
  async login(payload: LoginPayload) {
    await delay();
    const user = demoUsers.find(
      (u) => u.email.toLowerCase() === payload.email.toLowerCase() && u.password === payload.password,
    );
    if (!user) {
      throw new Error("Invalid email or password.");
    }
    const { password: _pw, ...session } = user;
    return {
      user: session,
      tokens: {
        accessToken: `demo.${session.id}`,
        refreshToken: `demo.refresh.${session.id}`,
        expiresAt: Date.now() + 1000 * 60 * 30,
      },
    };
  },
  async register(payload: RegisterPayload) {
    await delay();
    const user: SessionUser = {
      id: `usr_${payload.email}`,
      name: payload.name,
      email: payload.email,
      roles: ["citizen"],
      activeRole: "citizen",
      campusName: "Northridge Campus (synthetic)",
    };
    return {
      user,
      tokens: {
        accessToken: `demo.${user.id}`,
        refreshToken: `demo.refresh.${user.id}`,
        expiresAt: Date.now() + 1000 * 60 * 30,
      },
    };
  },
  async myReports() {
    await delay();
    return mockReports.filter((r) => r.reporterId === "usr_citizen");
  },
  async submitReport(input: {
    category: IncidentCategory;
    text: string;
    location: GeoPoint;
    locationLabel: string;
    channel: "sos" | "form" | "voice";
    idempotencyKey: string;
    delivered: boolean;
  }) {
    await delay(400);
    if (!input.delivered) {
      throw new Error("offline");
    }
    return addCitizenReport({
      createdAt: new Date().toISOString(),
      channel: input.channel,
      category: input.category,
      text: input.text,
      location: input.location,
      locationLabel: input.locationLabel,
      media: [],
      processingState: "queued_for_ai",
      deliveryState: "received_by_server",
    });
  },
  async incidents() {
    await delay();
    return mockIncidents;
  },
  async evidence(incidentId: string) {
    await delay();
    return mockEvidence[incidentId] ?? null;
  },
  async responders() {
    await delay();
    return mockResponders;
  },
  async assignments() {
    await delay();
    return mockAssignments;
  },
  async alerts() {
    await delay();
    return nearbyAlerts;
  },
};

export function isMockEnabled() {
  return apiConfig.useMock;
}
