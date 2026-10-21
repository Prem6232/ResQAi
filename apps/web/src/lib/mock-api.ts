import { http } from "./axios";
import type { LoginPayload, RegisterPayload, SessionUser } from "@/types/auth";
import type { IncidentCategory } from "@/types/incident";
import type { GeoPoint } from "@/types/common";
import type { Report } from "@/types/report";
import type { Incident } from "@/types/incident";
import type { ResponderProfile, NearbyAlert } from "@/types/responder";
import type { Assignment } from "@/types/assignment";

export const mockApi = {
  async health() {
    const res = await http.get("/health");
    return {
      status: res.data?.status === "healthy" ? "ok" : (res.data?.status || "ok"),
      service: "sentinelgrid-backend",
      postgis: { connected: res.data?.database === "connected", version: res.data?.postgis_version },
      demo: false,
      timestamp: new Date().toISOString(),
    };
  },

  async login(payload: LoginPayload) {
    const res = await http.post("/auth/login", {
      email: payload.email,
      password: payload.password,
    });
    const data = res.data;
    const user: SessionUser = {
      id: String(data.user.id),
      name: data.user.fullName || data.user.full_name || data.user.name || data.user.email,
      email: data.user.email,
      roles: data.user.roles || [data.user.role],
      activeRole: data.user.activeRole || data.user.role,
      campusName: data.user.campusName || "Northridge Campus",
    };
    return {
      user,
      tokens: {
        accessToken: data.access_token || data.accessToken,
        refreshToken: data.refresh_token || data.refreshToken,
        expiresAt: Date.now() + (data.expires_in || 1800) * 1000,
      },
    };
  },

  async register(payload: RegisterPayload) {
    const res = await http.post("/auth/register", {
      email: payload.email,
      password: payload.password,
      full_name: payload.name,
      fullName: payload.name,
      role: "citizen",
    });
    const data = res.data;
    const user: SessionUser = {
      id: String(data.user.id),
      name: data.user.fullName || data.user.full_name || data.user.name || data.user.email,
      email: data.user.email,
      roles: data.user.roles || [data.user.role],
      activeRole: data.user.activeRole || data.user.role,
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
  },

  async myReports(): Promise<Report[]> {
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
      synthetic: false,
    }));
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
    if (!input.delivered) {
      throw new Error("offline");
    }
    let res;
    if (input.channel === "sos") {
      res = await http.post("/citizen/sos", {
        location: input.location,
        locationLabel: input.locationLabel,
        location_label: input.locationLabel,
        idempotencyKey: input.idempotencyKey,
        idempotency_key: input.idempotencyKey,
      });
    } else {
      res = await http.post("/citizen/reports", {
        category: input.category,
        text: input.text,
        location: input.location,
        locationLabel: input.locationLabel,
        location_label: input.locationLabel,
        channel: input.channel,
        idempotencyKey: input.idempotencyKey,
        idempotency_key: input.idempotencyKey,
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
      synthetic: false,
    };
  },

  async incidents(): Promise<Incident[]> {
    const res = await http.get("/operator/incidents");
    return (res.data || []).map((inc: any): Incident => ({
      id: String(inc.id),
      publicCode: inc.publicCode || inc.public_code || `INC-${inc.id.slice(0, 4)}`,
      category: inc.category || "hazard",
      urgency: inc.urgency || "high",
      status: inc.status || "reported",
      title: inc.title || `Incident ${inc.publicCode || inc.public_code || inc.id.slice(0, 6)}`,
      location: inc.location && typeof inc.location === "object" ? inc.location : { lat: 28.5452, lng: 77.2731 },
      locationLabel: inc.locationLabel || inc.location_label || "Campus Perimeter",
      reportIds: inc.reportIds || inc.report_ids || [],
      createdAt: inc.createdAt || inc.created_at || new Date().toISOString(),
      updatedAt: inc.updatedAt || inc.updated_at || new Date().toISOString(),
      evidenceLabel: inc.evidenceLabel || inc.evidence_label || "unverified",
      hidePreciseLocationFromPublic: Boolean(inc.hidePreciseLocationFromPublic || inc.hide_precise_location),
      synthetic: false,
    }));
  },

  async evidence(incidentId: string) {
    try {
      const res = await http.get(`/operator/incidents/${incidentId}/evidence`);
      return res.data;
    } catch {
      try {
        const fallback = await http.get(`/operator/incidents/${incidentId}`);
        return fallback.data?.evidence || null;
      } catch {
        return null;
      }
    }
  },

  async responders(): Promise<ResponderProfile[]> {
    let res;
    try {
      res = await http.get("/operator/responders");
    } catch {
      res = await http.get("/admin/responders");
    }
    return (res.data || []).map((r: any): ResponderProfile => ({
      id: String(r.id),
      userId: String(r.userId || r.user_id || r.id),
      unitCode: r.unitCode || r.unit_code || "UNIT-1",
      displayName: r.displayName || r.display_name || r.name || "Responder Unit",
      type: r.type || r.responderType || r.responder_type || "campus_security",
      status: r.status || (r.isOnDuty || r.is_on_duty ? "available" : "offline"),
      capabilities: r.capabilities || ["security_patrol"],
      lastLocation: r.lastLocation || r.last_location || (r.location ? r.location : undefined),
      lastLocationAt: r.lastLocationAt || r.last_location_at,
      currentJob: r.currentJob || r.current_job,
      shareLocation: Boolean(r.shareLocation ?? r.share_location ?? true),
      approved: Boolean(r.isApproved ?? r.is_approved ?? r.approved ?? true),
      synthetic: false,
    }));
  },

  async assignments(): Promise<Assignment[]> {
    try {
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
        synthetic: false,
      }));
    } catch {
      return [];
    }
  },

  async alerts(): Promise<NearbyAlert[]> {
    const res = await http.get("/citizen/alerts/nearby");
    return res.data || [];
  },

  async contacts() {
    try {
      const res = await http.get("/citizen/contacts");
      return res.data || [];
    } catch {
      return [];
    }
  },

  async addContact(input: { name: string; phone: string; relationshipLabel?: string }) {
    const res = await http.post("/citizen/contacts", {
      name: input.name,
      phone: input.phone,
      relationshipLabel: input.relationshipLabel,
      relationship_label: input.relationshipLabel,
    });
    return res.data;
  },

  async deleteContact(id: string) {
    const res = await http.delete(`/citizen/contacts/${id}`);
    return res.data;
  },

  async updateDuty(isOnDuty: boolean) {
    const res = await http.post("/responder/duty", {
      isOnDuty,
      is_on_duty: isOnDuty,
    });
    return res.data;
  },

  async duplicates() {
    try {
      const res = await http.get("/operator/duplicates");
      return res.data || [];
    } catch {
      return [];
    }
  },

  async mergeReports(targetIncidentId: string, reportIds: string[], reason: string) {
    const res = await http.post("/operator/actions/merge", {
      targetIncidentId,
      target_incident_id: targetIncidentId,
      reportIds,
      report_ids: reportIds,
      reason,
    });
    return res.data;
  },

  async getSettings() {
    try {
      const res = await http.get("/operator/settings");
      return res.data;
    } catch {
      return null;
    }
  },

  async updateSettings(payload: any) {
    const res = await http.put("/operator/settings", payload);
    return res.data;
  },

  async overrideIncident(incidentId: string, category: string, urgency: string, reason: string) {
    const res = await http.post("/operator/actions/override", {
      incidentId,
      incident_id: incidentId,
      category,
      urgency,
      reason,
    });
    return res.data;
  },

  async dispatchIncident(incidentId: string, responderId: string, note?: string) {
    const res = await http.post("/operator/actions/dispatch", {
      incidentId,
      incident_id: incidentId,
      responderId,
      responder_id: responderId,
      note: note || "Immediate response requested",
    });
    return res.data;
  },

  async respondToOffer(assignmentId: string, action: "accepted" | "declined") {
    const res = await http.post(`/responder/offers/${assignmentId}/respond`, {
      status: action,
    });
    return res.data;
  },

  async updateAssignmentStatus(assignmentId: string, status: "en_route" | "arrived" | "completed") {
    const res = await http.post(`/responder/assignments/${assignmentId}/status`, {
      status,
    });
    return res.data;
  },

  async updateIncidentState(incidentId: string, toStatus: string, reason: string) {
    const res = await http.post("/operator/actions/state", {
      incidentId,
      incident_id: incidentId,
      toStatus,
      to_status: toStatus,
      reason,
    });
    return res.data;
  },
};

export function isMockEnabled() {
  return false;
}
