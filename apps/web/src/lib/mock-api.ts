import { apiConfig } from "@/config/api.config";
import { http } from "./axios";
import type { LoginPayload, RegisterPayload, SessionUser } from "@/types/auth";
import type { IncidentCategory } from "@/types/incident";
import type { GeoPoint } from "@/types/common";
import type { Report } from "@/types/report";
import type { Incident } from "@/types/incident";
import type { ResponderProfile, NearbyAlert } from "@/types/responder";
import type { Assignment } from "@/types/assignment";
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
    if (!apiConfig.useMock) {
      try {
        const res = await http.get("/health");
        return {
          status: res.data?.status === "healthy" ? "ok" : (res.data?.status || "ok"),
          service: "sentinelgrid-backend",
          postgis: { connected: res.data?.database === "connected", version: res.data?.postgis_version },
          demo: false,
          timestamp: new Date().toISOString(),
        };
      } catch (e) {
        console.warn("Live health check failed, falling back to mock hint", e);
      }
    }
    await delay(120);
    return healthPayload();
  },
  async login(payload: LoginPayload) {
    if (!apiConfig.useMock) {
      const res = await http.post("/auth/login", {
        email: payload.email,
        password: payload.password,
      });
      const data = res.data;
      const user: SessionUser = {
        id: String(data.user.id),
        name: data.user.fullName || data.user.full_name || data.user.email,
        email: data.user.email,
        roles: [data.user.role],
        activeRole: data.user.role,
        campusName: "Northridge Campus",
      };
      return {
        user,
        tokens: {
          accessToken: data.access_token || data.accessToken,
          refreshToken: data.refresh_token || data.refreshToken,
          expiresAt: Date.now() + (data.expires_in || 1800) * 1000,
        },
      };
    }
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
    if (!apiConfig.useMock) {
      const res = await http.post("/auth/register", {
        email: payload.email,
        password: payload.password,
        fullName: payload.name,
        role: "citizen",
      });
      const data = res.data;
      const user: SessionUser = {
        id: String(data.user.id),
        name: data.user.fullName || data.user.full_name || data.user.email,
        email: data.user.email,
        roles: [data.user.role],
        activeRole: data.user.role,
        campusName: "Northridge Campus",
      };
      return {
        user,
        tokens: {
          accessToken: data.access_token || data.accessToken,
          refreshToken: data.refresh_token || data.refreshToken,
          expiresAt: Date.now() + (data.expires_in || 1800) * 1000,
        },
      };
    }
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
  async myReports(): Promise<Report[]> {
    if (!apiConfig.useMock) {
      const res = await http.get("/citizen/reports");
      return (res.data || []).map((r: any): Report => ({
        id: String(r.id),
        reporterId: r.reporterId || r.reporter_id || "usr_citizen",
        createdAt: r.createdAt || r.created_at || new Date().toISOString(),
        channel: r.channel || "form",
        category: r.category || "hazard",
        text: r.text || r.raw_text || "",
        location: r.location && typeof r.location === "object" ? r.location : { lat: 28.5452, lng: 77.2731 },
        locationLabel: r.locationLabel || r.location_label || "Campus Area",
        media: r.media || [],
        processingState: r.processingState || r.processing_state || "received",
        deliveryState: r.deliveryState || r.delivery_state || "received_by_server",
        incidentId: r.incidentId || r.incident_id,
        cancelledReason: r.cancelledReason || r.cancelled_reason,
        synthetic: true,
      }));
    }
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
  }): Promise<Report> {
    if (!apiConfig.useMock) {
      if (!input.delivered) {
        throw new Error("offline");
      }
      let res;
      if (input.channel === "sos") {
        res = await http.post("/citizen/sos", {
          location: input.location,
          locationLabel: input.locationLabel,
          idempotencyKey: input.idempotencyKey,
        });
      } else {
        res = await http.post("/citizen/reports", {
          category: input.category,
          text: input.text,
          location: input.location,
          locationLabel: input.locationLabel,
          channel: input.channel,
          idempotencyKey: input.idempotencyKey,
        });
      }
      const r = res.data;
      return {
        id: String(r.id),
        reporterId: r.reporterId || r.reporter_id || "usr_citizen",
        createdAt: r.createdAt || r.created_at || new Date().toISOString(),
        channel: r.channel || input.channel,
        category: r.category || input.category,
        text: r.text || r.raw_text || input.text,
        location: r.location && typeof r.location === "object" ? r.location : input.location,
        locationLabel: r.locationLabel || r.location_label || input.locationLabel,
        media: r.media || [],
        processingState: r.processingState || r.processing_state || "queued_for_ai",
        deliveryState: r.deliveryState || r.delivery_state || "received_by_server",
        incidentId: r.incidentId || r.incident_id,
        synthetic: true,
      };
    }
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
  async incidents(): Promise<Incident[]> {
    if (!apiConfig.useMock) {
      const res = await http.get("/operator/incidents");
      return (res.data || []).map((inc: any): Incident => ({
        id: String(inc.id),
        publicCode: inc.publicCode || inc.public_code || `INC-${inc.id.slice(0, 4)}`,
        category: inc.category || "hazard",
        urgency: inc.urgency || "high",
        status: inc.status || "reported",
        title: inc.title || "Campus Incident",
        location: inc.location && typeof inc.location === "object" ? inc.location : { lat: 28.5452, lng: 77.2731 },
        locationLabel: inc.locationLabel || inc.location_label || "Campus Area",
        reportIds: inc.reportIds || inc.report_ids || [],
        createdAt: inc.createdAt || inc.created_at || new Date().toISOString(),
        updatedAt: inc.updatedAt || inc.updated_at || new Date().toISOString(),
        evidenceLabel: inc.evidenceLabel || inc.evidence_label || "unverified",
        hidePreciseLocationFromPublic: Boolean(inc.hidePreciseLocationFromPublic || inc.hide_precise_location),
        synthetic: true,
      }));
    }
    await delay();
    return mockIncidents;
  },
  async evidence(incidentId: string) {
    if (!apiConfig.useMock) {
      try {
        const res = await http.get(`/operator/incidents/${incidentId}/evidence`);
        return res.data;
      } catch {
        return null;
      }
    }
    await delay();
    return mockEvidence[incidentId] ?? null;
  },
  async responders(): Promise<ResponderProfile[]> {
    if (!apiConfig.useMock) {
      const res = await http.get("/admin/responders");
      return (res.data || []).map((r: any): ResponderProfile => ({
        id: String(r.id),
        userId: String(r.userId || r.user_id),
        unitCode: r.unitCode || r.unit_code || "UNIT-1",
        displayName: r.displayName || r.display_name || r.name || "Responder Unit",
        type: r.type || "campus_security",
        status: r.status || "available",
        capabilities: r.capabilities || ["security_patrol"],
        lastLocation: r.lastLocation || r.last_location,
        lastLocationAt: r.lastLocationAt || r.last_location_at,
        currentJob: r.currentJob || r.current_job,
        shareLocation: Boolean(r.shareLocation ?? true),
        approved: Boolean(r.isApproved ?? r.approved ?? true),
        synthetic: true,
      }));
    }
    await delay();
    return mockResponders;
  },
  async assignments(): Promise<Assignment[]> {
    if (!apiConfig.useMock) {
      const res = await http.get("/responder/assignments");
      return (res.data || []).map((a: any): Assignment => ({
        id: String(a.id),
        incidentId: String(a.incidentId || a.incident_id),
        responderId: String(a.responderId || a.responder_id),
        slotId: a.slotId || a.slot_id || "slot_1",
        status: a.status || "offered",
        offeredAt: a.offeredAt || a.offered_at || new Date().toISOString(),
        acknowledgedAt: a.acknowledgedAt || a.acknowledged_at,
        etaMinutes: a.etaMinutes ?? a.eta_minutes ?? 5,
        distanceKm: a.distanceKm ?? a.distance_km ?? 0.8,
        routeNote: a.routeNote || a.route_note,
        synthetic: true,
      }));
    }
    await delay();
    return mockAssignments;
  },
  async alerts(): Promise<NearbyAlert[]> {
    if (!apiConfig.useMock) {
      const res = await http.get("/citizen/alerts/nearby");
      return res.data || [];
    }
    await delay();
    return nearbyAlerts;
  },
};

export function isMockEnabled() {
  return apiConfig.useMock;
}
