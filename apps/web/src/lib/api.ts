import type { Assignment, AssignmentStatus } from "@/types/assignment";
import type { LoginPayload, RegisterPayload, SessionUser } from "@/types/auth";
import type { GeoPoint, Role } from "@/types/common";
import type { Incident, IncidentCategory, IncidentStatus, IncidentStatusEvent, Urgency } from "@/types/incident";
import type { MediaAsset, Report } from "@/types/report";
import type { NearbyAlert, ResponderAvailability, ResponderCapability, ResponderProfile } from "@/types/responder";
import type { EvidenceAssessment } from "@/types/ai-evidence";
import type { RoutePath } from "@/types/geospatial";
import { http } from "@/lib/axios";
import { buildStraightLineRoute, sanitizeToBhopal } from "@/components/maps/liveResponderMapUtils";

export interface AnalyticsSummary {
  totalIncidents: number;
  activeIncidents: number;
  resolvedIncidents: number;
  openReportsCount: number;
  activeRespondersCount: number;
  avgArrivalTimeMinutes: number;
  avgResponseTimeSeconds: number;
  falseAlarmRate: number;
  syntheticDrillMode: boolean;
}

export interface HotspotFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    incidentId?: string;
    incident_id?: string;
    title: string;
    category: string;
    urgency: string;
    status: string;
    weight: number;
  };
}

export interface HotspotFeatureCollection {
  type: "FeatureCollection";
  features: HotspotFeature[];
}

export interface CategoryBreakdownItem {
  category: string;
  name: string;
  count: number;
  percentage: number;
}

export interface CategoryBreakdown {
  categories: CategoryBreakdownItem[];
  total: number;
}

export interface ResponseTimeStats {
  milestones: Array<{
    phase: string;
    avgSeconds?: number;
    avg_seconds?: number;
    p95Seconds?: number;
    p95_seconds?: number;
  }>;
  timeline: Array<{
    date: string;
    avgResponseSeconds?: number;
    avg_response_seconds?: number;
    count: number;
  }>;
}

export interface DispatchRecommendation {
  responderId: string;
  unitCode: string;
  displayName: string;
  responderType: string;
  capabilities: string[];
  distanceKm: number;
  etaMinutes: number;
  score: number;
  matchReason: string;
}

export interface IncidentDetail {
  incident: Incident;
  linkedReports: Report[];
  evidence: EvidenceAssessment | null;
  assignments: Assignment[];
  timeline: IncidentStatusEvent[];
}

export interface OperatingArea {
  id: string;
  name: string;
  polygon: number[][];
  srid: number;
  isActive: boolean;
  createdAt: string;
  geojson?: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

export interface DuplicatePairing {
  incidentIdA: string;
  incidentIdB: string;
  score: number;
  signals: string[];
  recommendation: "review" | "likely_related" | "weak";
}

export interface OperatorSettings {
  autoDispatchEnabled: boolean;
  clusterRadiusMeters: number;
  audioAlertsEnabled: boolean;
  triageWindowMinutes: number;
  highUrgencyThreshold: number;
}

type RawRecord = Record<string, unknown>;

export function normalizeCategory(raw: unknown): IncidentCategory {
  const val = String(raw || "").toLowerCase().trim();
  if (val === "fire_smoke" || val === "fire" || val === "smoke") return "fire_smoke";
  if (val === "road_accident" || val === "accident" || val === "traffic") return "road_accident";
  if (val === "medical" || val === "medical_emergency" || val === "health") return "medical";
  if (val === "personal_safety" || val === "sos" || val === "personal_sos" || val === "safety" || val === "security" || val === "harassment") {
    return "personal_safety";
  }
  if (val === "water_flood" || val === "flood" || val === "water") return "water_flood";
  if (val === "hazard") return "hazard";
  return "other";
}

export function normalizeUrgency(raw: unknown): Urgency {
  const val = String(raw || "").toLowerCase().trim();
  if (val === "critical" || val === "high" || val === "medium" || val === "low") {
    return val;
  }
  return "high";
}

function mapReport(r: RawRecord): Report {
  const rawLoc = (r.location && typeof r.location === "object" ? r.location : { lat: 23.2599, lng: 77.4126, source: "gps" }) as GeoPoint;
  const loc: GeoPoint = sanitizeToBhopal({
    lat: rawLoc.lat,
    lng: rawLoc.lng,
    source: (rawLoc.source as GeoPoint["source"]) || "gps",
    accuracyMeters: rawLoc.accuracyMeters,
  });
  return {
    id: String(r.id),
    reporterId: String(r.reporterId || r.reporter_id || "usr_citizen"),
    createdAt: String(r.createdAt || r.created_at || new Date().toISOString()),
    channel: (r.channel as Report["channel"]) || "form",
    category: normalizeCategory(r.category),
    text: String(r.text || r.raw_text || ""),
    location: loc,
    locationLabel: String(r.locationLabel || r.location_label || "Bhopal City"),
    media: (Array.isArray(r.media) ? r.media : []) as MediaAsset[],
    processingState: (r.processingState || r.processing_state || "received") as Report["processingState"],
    deliveryState: (r.deliveryState || r.delivery_state || "received_by_server") as Report["deliveryState"],
    incidentId: r.incidentId || r.incident_id ? String(r.incidentId || r.incident_id) : undefined,
    cancelledReason: r.cancelledReason || r.cancelled_reason ? String(r.cancelledReason || r.cancelled_reason) : undefined,
    synthetic: Boolean(r.synthetic ?? false),
  };
}

function mapIncident(inc: RawRecord): Incident {
  const rawLoc = (inc.location && typeof inc.location === "object" ? inc.location : { lat: 23.2599, lng: 77.4126, source: "gps" }) as GeoPoint;
  const loc: GeoPoint = sanitizeToBhopal({
    lat: rawLoc.lat,
    lng: rawLoc.lng,
    source: (rawLoc.source as GeoPoint["source"]) || "gps",
    accuracyMeters: rawLoc.accuracyMeters,
  });
  const rawId = String(inc.id);
  const publicCode = String(inc.publicCode || inc.public_code || `INC-${rawId.slice(0, 4)}`);
  const rawIds = inc.reportIds ?? inc.report_ids;
  const reportIds = Array.isArray(rawIds) ? rawIds.map(String) : [];
  return {
    id: rawId,
    publicCode,
    category: normalizeCategory(inc.category),
    urgency: normalizeUrgency(inc.urgency),
    status: (inc.status as IncidentStatus) || "reported",
    title: String(inc.title || `Incident ${publicCode}`),
    location: loc,
    locationLabel: String(inc.locationLabel || inc.location_label || "Bhopal Region"),
    reportIds,
    createdAt: String(inc.createdAt || inc.created_at || new Date().toISOString()),
    updatedAt: String(inc.updatedAt || inc.updated_at || new Date().toISOString()),
    evidenceLabel: (inc.evidenceLabel || inc.evidence_label || "unverified") as Incident["evidenceLabel"],
    hidePreciseLocationFromPublic: Boolean(inc.hidePreciseLocationFromPublic || inc.hide_precise_location),
    synthetic: Boolean(inc.synthetic ?? false),
  };
}

function mapAssignment(a: RawRecord): Assignment {
  const rawInc = a.incident && typeof a.incident === "object" ? (a.incident as RawRecord) : null;
  const incLoc = rawInc?.location && typeof rawInc.location === "object" ? (rawInc.location as GeoPoint) : { lat: 23.2599, lng: 77.4126, source: "gps" as const };
  return {
    id: String(a.id),
    incidentId: String(a.incidentId || a.incident_id),
    responderId: String(a.responderId || a.responder_id),
    slotId: String(a.slotId || a.slot_id || a.id || "slot_1"),
    status: (a.status as AssignmentStatus) || "offered",
    offeredAt: String(a.offeredAt || a.offered_at || new Date().toISOString()),
    offerDeadline: a.offerDeadline || a.offer_deadline ? String(a.offerDeadline || a.offer_deadline) : undefined,
    acknowledgedAt: a.acknowledgedAt || a.acknowledged_at ? String(a.acknowledgedAt || a.acknowledged_at) : undefined,
    completedAt: a.completedAt || a.completed_at ? String(a.completedAt || a.completed_at) : undefined,
    etaMinutes: typeof (a.etaMinutes ?? a.eta_minutes) === "number" ? Number(a.etaMinutes ?? a.eta_minutes) : undefined,
    distanceKm: typeof (a.distanceKm ?? a.distance_km) === "number" ? Number(a.distanceKm ?? a.distance_km) : undefined,
    routeNote: a.routeNote || a.route_note ? String(a.routeNote || a.route_note) : undefined,
    incident: rawInc
      ? {
          id: String(rawInc.id),
          publicCode: rawInc.publicCode || rawInc.public_code ? String(rawInc.publicCode || rawInc.public_code) : undefined,
          title: String(rawInc.title || "Assigned Incident"),
          category: normalizeCategory(rawInc.category),
          urgency: normalizeUrgency(rawInc.urgency),
          status: (rawInc.status as IncidentStatus) || "assigned",
          location: sanitizeToBhopal({
            lat: incLoc.lat,
            lng: incLoc.lng,
            source: (incLoc.source as GeoPoint["source"]) || "gps",
            accuracyMeters: incLoc.accuracyMeters,
          }),
          locationLabel: String(rawInc.locationLabel || rawInc.location_label || "Bhopal City"),
        }
      : undefined,
    synthetic: Boolean(a.synthetic ?? false),
  };
}

function mapResponderProfile(r: RawRecord): ResponderProfile {
  const rawLoc = (r.lastLocation || r.last_location || r.location) as RawRecord | undefined;
  const lastLocation: GeoPoint | undefined =
    rawLoc && typeof rawLoc.lat === "number" && typeof rawLoc.lng === "number"
      ? sanitizeToBhopal({
          lat: Number(rawLoc.lat),
          lng: Number(rawLoc.lng),
          source: (rawLoc.source as GeoPoint["source"]) || "gps",
          accuracyMeters: typeof rawLoc.accuracyMeters === "number" ? rawLoc.accuracyMeters : undefined,
        })
      : undefined;
  const userObj = r.user && typeof r.user === "object" ? (r.user as RawRecord) : undefined;
  return {
    id: String(r.id),
    userId: String(r.userId || r.user_id || r.id),
    unitCode: String(r.unitCode || r.unit_code || "UNIT-1"),
    displayName: String(r.displayName || r.display_name || r.name || "Responder Unit"),
    fullName: userObj?.full_name || userObj?.fullName ? String(userObj.full_name || userObj.fullName) : undefined,
    email: userObj?.email ? String(userObj.email) : undefined,
    phone: userObj?.phone ? String(userObj.phone) : undefined,
    type: (r.type || r.responderType || r.responder_type || "campus_security") as ResponderProfile["type"],
    status: (r.status || r.availabilityStatus || r.availability_status || (r.isOnDuty || r.is_on_duty ? "available" : "offline")) as ResponderProfile["status"],
    capabilities: (Array.isArray(r.capabilities) ? r.capabilities : ["security_patrol"]) as ResponderProfile["capabilities"],
    lastLocation,
    lastLocationAt:
      r.lastLocationAt || r.last_location_at || r.lastPingAt || r.last_ping_at
        ? String(r.lastLocationAt || r.last_location_at || r.lastPingAt || r.last_ping_at)
        : undefined,
    currentJob: r.currentJob || r.current_job ? String(r.currentJob || r.current_job) : undefined,
    shareLocation: Boolean(r.shareLocation ?? r.share_location ?? true),
    approved: Boolean(r.isApproved ?? r.is_approved ?? r.approved ?? false),
    synthetic: Boolean(r.synthetic ?? false),
  };
}

/**
 * ResQAI Live Backend API Client (FastAPI)
 * All operations dispatch to live REST endpoints via Axios with JWT authorization.
 */
export const api = {
  async health(): Promise<{ status: string }> {
    const res = await http.get("/health");
    return res.data as { status: string };
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
      campusName: data.user.campusName || "Bhopal Metropolitan Area",
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
      campusName: "Bhopal Metropolitan Area",
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

  async getMe(): Promise<SessionUser> {
    const res = await http.get("/auth/me");
    const u = res.data as RawRecord;
    const role = (u.activeRole || u.role || "citizen") as Role;
    return {
      id: String(u.id),
      name: String(u.fullName || u.full_name || u.name || u.email),
      email: String(u.email),
      roles: (Array.isArray(u.roles) ? u.roles : [role]) as Role[],
      activeRole: role,
      campusName: String(u.campusName || "Bhopal Metropolitan Area"),
    };
  },

  async myReports(): Promise<Report[]> {
    const res = await http.get("/citizen/reports");
    return (Array.isArray(res.data) ? res.data : []).map((r: RawRecord) => mapReport(r));
  },

  async getReport(id: string): Promise<Report> {
    const res = await http.get(`/citizen/reports/${id}`);
    return mapReport(res.data as RawRecord);
  },

  async cancelReport(id: string, reason: string): Promise<Report> {
    const res = await http.post(`/citizen/reports/${id}/cancel`, { reason });
    return mapReport(res.data as RawRecord);
  },

  async submitReport(input: {
    category: IncidentCategory;
    text: string;
    location: GeoPoint;
    locationLabel: string;
    channel: "sos" | "form" | "voice";
    idempotencyKey: string;
    delivered: boolean;
    mediaAssetIds?: string[];
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
        text: input.text || "Incident reported from citizen web",
        location: input.location,
        locationLabel: input.locationLabel,
        location_label: input.locationLabel,
        channel: input.channel,
        idempotencyKey: input.idempotencyKey,
        idempotency_key: input.idempotencyKey,
        mediaAssetIds: input.mediaAssetIds ?? [],
        media_asset_ids: input.mediaAssetIds ?? [],
      });
    }
    return mapReport(res.data as RawRecord);
  },

  async previewTextTriage(text: string): Promise<EvidenceAssessment["text"] | null> {
    if (!text.trim()) return null;
    try {
      const res = await http.post("/citizen/triage-preview", { text: text.trim() });
      return res.data as EvidenceAssessment["text"];
    } catch {
      return null;
    }
  },

  async requestMediaUpload(file: File): Promise<string | null> {
    try {
      const res = await http.post("/media/upload-url", {
        fileName: file.name,
        file_name: file.name,
        mimeType: file.type || "application/octet-stream",
        mime_type: file.type || "application/octet-stream",
        fileSizeBytes: file.size,
        file_size_bytes: file.size,
      });
      const data = res.data as RawRecord;
      const assetId = String(data.mediaAssetId || data.media_asset_id || "");
      const uploadUrl = String(data.uploadUrl || data.upload_url || "");
      if (uploadUrl) {
        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!putRes.ok) {
          return null;
        }
      }
      if (assetId) {
        await http.post(`/media/${assetId}/confirm`);
        return assetId;
      }
      return null;
    } catch {
      return null;
    }
  },

  async incidents(): Promise<Incident[]> {
    const res = await http.get("/operator/incidents");
    return (Array.isArray(res.data) ? res.data : []).map((inc: RawRecord) => mapIncident(inc));
  },

  async incidentDetail(incidentId: string): Promise<IncidentDetail | null> {
    try {
      const res = await http.get(`/operator/incidents/${incidentId}`);
      const d = res.data as RawRecord;
      const rawTimeline = Array.isArray(d.timeline) ? (d.timeline as RawRecord[]) : [];
      const rawReports = Array.isArray(d.linkedReports || d.linked_reports)
        ? ((d.linkedReports || d.linked_reports) as RawRecord[])
        : [];
      const rawAssignments = Array.isArray(d.assignments) ? (d.assignments as RawRecord[]) : [];
      return {
        incident: mapIncident((d.incident as RawRecord) || d),
        linkedReports: rawReports.map(mapReport),
        evidence: (d.evidence as EvidenceAssessment | null) ?? null,
        assignments: rawAssignments.map(mapAssignment),
        timeline: rawTimeline.map((e) => ({
          id: String(e.id),
          incidentId: String(e.incidentId || e.incident_id || incidentId),
          from: (e.fromStatus || e.from_status) as IncidentStatus | undefined,
          to: (e.toStatus || e.to_status || "reported") as IncidentStatus,
          at: String(e.at || new Date().toISOString()),
          actorRole: String(e.actorRole || e.actor_role || "operator"),
          note: e.note ? String(e.note) : undefined,
        })),
      };
    } catch {
      return null;
    }
  },

  async evidence(incidentId: string): Promise<EvidenceAssessment | null> {
    try {
      const res = await http.get(`/operator/incidents/${incidentId}/evidence`);
      return res.data as EvidenceAssessment;
    } catch {
      const detail = await this.incidentDetail(incidentId);
      return detail?.evidence ?? null;
    }
  },

  async recommendations(incidentId: string): Promise<DispatchRecommendation[]> {
    try {
      const res = await http.get(`/operator/incidents/${incidentId}/recommendations`);
      return Array.isArray(res.data) ? (res.data as DispatchRecommendation[]) : [];
    } catch {
      return [];
    }
  },

  async responders(): Promise<ResponderProfile[]> {
    let res;
    try {
      res = await http.get("/operator/responders");
    } catch {
      res = await http.get("/admin/responders");
    }
    return (Array.isArray(res.data) ? res.data : []).map((r: RawRecord) => mapResponderProfile(r));
  },

  async adminResponders(): Promise<ResponderProfile[]> {
    const res = await http.get("/admin/responders");
    return (Array.isArray(res.data) ? res.data : []).map((r: RawRecord) => mapResponderProfile(r));
  },

  async toggleDrillMode(enabled: boolean): Promise<{ ok: boolean; drillMode: boolean }> {
    const res = await http.post("/admin/drill-mode", {
      enabled,
      drillMode: enabled,
    });
    const d = res.data as RawRecord;
    return {
      ok: Boolean(d.ok ?? true),
      drillMode: Boolean(d.drillMode ?? d.drill_mode ?? enabled),
    };
  },

  async assignments(): Promise<Assignment[]> {
    try {
      const res = await http.get("/responder/assignments");
      return (Array.isArray(res.data) ? res.data : []).map((a: RawRecord) => mapAssignment(a));
    } catch {
      return [];
    }
  },

  async responderHistory(): Promise<Assignment[]> {
    try {
      const res = await http.get("/responder/history");
      return (Array.isArray(res.data) ? res.data : []).map((a: RawRecord) => mapAssignment(a));
    } catch {
      return [];
    }
  },

  async appendAssignmentNotes(assignmentId: string, notes: string): Promise<Assignment> {
    const res = await http.post(`/responder/assignments/${assignmentId}/notes`, { notes });
    return mapAssignment(res.data as RawRecord);
  },

  async alerts(lat?: number, lng?: number, radiusKm = 5.0): Promise<NearbyAlert[]> {
    const params: Record<string, number> = { radius_km: radiusKm };
    if (typeof lat === "number" && typeof lng === "number") {
      params.lat = lat;
      params.lng = lng;
    }
    const res = await http.get("/citizen/alerts/nearby", { params });
    return (Array.isArray(res.data) ? res.data : []).map((a: RawRecord): NearbyAlert => ({
      id: String(a.id),
      category: (a.category as IncidentCategory) || "other",
      title: String(a.title || "Campus Alert"),
      distanceLabel: String(a.distanceLabel || a.distance_label || "Nearby"),
      statusLabel: String(a.statusLabel || a.status_label || "Active"),
      tone: (a.tone as NearbyAlert["tone"]) || "active",
      coarsened: true,
      location: a.location && typeof a.location === "object" ? (a.location as { lat: number; lng: number }) : undefined,
    }));
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

  async updateDuty(isOnDuty: boolean, shareLocation?: boolean) {
    const res = await http.patch("/responder/duty", {
      isOnDuty,
      is_on_duty: isOnDuty,
      availabilityStatus: isOnDuty ? "available" : "off_duty",
      availability_status: isOnDuty ? "available" : "off_duty",
      ...(shareLocation !== undefined
        ? { shareLocation, share_location: shareLocation }
        : {}),
    });
    return res.data;
  },

  async duplicates(): Promise<DuplicatePairing[]> {
    try {
      const res = await http.get("/operator/duplicates");
      return (Array.isArray(res.data) ? res.data : []).map((d: RawRecord): DuplicatePairing => ({
        incidentIdA: String(d.incidentIdA || d.incident_id_a || ""),
        incidentIdB: String(d.incidentIdB || d.incident_id_b || ""),
        score: Number(d.score ?? 0),
        signals: Array.isArray(d.signals) ? d.signals.map(String) : [],
        recommendation: (d.recommendation as DuplicatePairing["recommendation"]) || "review",
      }));
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

  async getSettings(): Promise<OperatorSettings | null> {
    try {
      const res = await http.get("/operator/settings");
      const s = res.data as RawRecord;
      return {
        autoDispatchEnabled: Boolean(s.autoDispatchEnabled ?? s.auto_dispatch_enabled ?? false),
        clusterRadiusMeters: Number(s.clusterRadiusMeters ?? s.cluster_radius_meters ?? 150),
        audioAlertsEnabled: Boolean(s.audioAlertsEnabled ?? s.audio_alerts_enabled ?? true),
        triageWindowMinutes: Number(s.triageWindowMinutes ?? s.triage_window_minutes ?? 30),
        highUrgencyThreshold: Number(s.highUrgencyThreshold ?? s.high_urgency_threshold ?? 0.8),
      };
    } catch {
      return null;
    }
  },

  async updateSettings(payload: Partial<OperatorSettings>) {
    const res = await http.put("/operator/settings", {
      ...payload,
      auto_dispatch_enabled: payload.autoDispatchEnabled,
      cluster_radius_meters: payload.clusterRadiusMeters,
      audio_alerts_enabled: payload.audioAlertsEnabled,
      triage_window_minutes: payload.triageWindowMinutes,
      high_urgency_threshold: payload.highUrgencyThreshold,
    });
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

  async updateAssignmentStatus(
    assignmentId: string,
    status: "accepted" | "en_route" | "arrived" | "on_scene" | "completed" | "failed",
    reason?: string
  ) {
    const res = await http.post(`/responder/assignments/${assignmentId}/status`, {
      status,
      reason,
      explanation: status === "failed" ? reason || "Unable to complete mission" : undefined,
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

  async analyticsSummary(): Promise<AnalyticsSummary | null> {
    try {
      const res = await http.get("/analytics/summary");
      const d = res.data as RawRecord;
      return {
        totalIncidents: Number(d.totalIncidents ?? d.total_incidents ?? 0),
        activeIncidents: Number(d.activeIncidents ?? d.active_incidents ?? 0),
        resolvedIncidents: Number(d.resolvedIncidents ?? d.resolved_incidents ?? 0),
        openReportsCount: Number(d.openReportsCount ?? d.open_reports_count ?? 0),
        activeRespondersCount: Number(d.activeRespondersCount ?? d.active_responders_count ?? 0),
        avgArrivalTimeMinutes: Number(d.avgArrivalTimeMinutes ?? d.avg_arrival_time_minutes ?? 0),
        avgResponseTimeSeconds: Number(d.avgResponseTimeSeconds ?? d.avg_response_time_seconds ?? 0),
        falseAlarmRate: Number(d.falseAlarmRate ?? d.false_alarm_rate ?? 0),
        syntheticDrillMode: Boolean(d.syntheticDrillMode ?? d.synthetic_drill_mode ?? true),
      };
    } catch {
      return null;
    }
  },

  async analyticsHotspots(): Promise<HotspotFeatureCollection> {
    try {
      const res = await http.get("/analytics/hotspots");
      const data = res.data as HotspotFeatureCollection;
      if (data && Array.isArray(data.features)) {
        return {
          ...data,
          features: data.features.map((feat) => {
            const [lng, lat] = feat.geometry.coordinates;
            const sanitized = sanitizeToBhopal({ lat, lng });
            return {
              ...feat,
              geometry: {
                ...feat.geometry,
                coordinates: [sanitized.lng, sanitized.lat],
              },
            };
          }),
        };
      }
      return data;
    } catch {
      return { type: "FeatureCollection", features: [] };
    }
  },

  async analyticsByCategory(): Promise<CategoryBreakdown> {
    try {
      const res = await http.get("/analytics/by-category");
      return res.data as CategoryBreakdown;
    } catch {
      return { categories: [], total: 0 };
    }
  },

  async analyticsResponseTimes(): Promise<ResponseTimeStats> {
    try {
      const res = await http.get("/analytics/response-times");
      return res.data as ResponseTimeStats;
    } catch {
      return { milestones: [], timeline: [] };
    }
  },

  async getOperatingArea(_role?: Role): Promise<OperatingArea | null> {
    try {
      let res;
      try {
        res = await http.get("/operating-area");
      } catch {
        res = await http.get("/admin/operating-area");
      }
      const d = res.data as RawRecord;
      return {
        id: String(d.id),
        name: String(d.name || "Bhopal Metro Zone"),
        polygon: Array.isArray(d.polygon) ? (d.polygon as number[][]) : [],
        srid: Number(d.srid ?? 4326),
        isActive: Boolean(d.isActive ?? d.is_active ?? true),
        createdAt: String(d.createdAt || d.created_at || new Date().toISOString()),
        geojson: d.geojson as OperatingArea["geojson"],
      };
    } catch {
      return null;
    }
  },

  async fetchRoute(
    from: Pick<GeoPoint, "lat" | "lng">,
    to: Pick<GeoPoint, "lat" | "lng">,
    profile: "foot" | "driving" | "bike" = "foot"
  ): Promise<RoutePath> {
    try {
      const res = await http.get("/routing/route", {
        params: {
          from_lat: from.lat,
          from_lng: from.lng,
          to_lat: to.lat,
          to_lng: to.lng,
          profile,
        },
      });
      const d = res.data as RawRecord;
      if (Array.isArray(d.coordinates) && d.coordinates.length >= 2) {
        return {
          coordinates: d.coordinates as [number, number][],
          distanceKm: Number(d.distanceKm ?? 0),
          durationMinutes: Math.max(1, Number(d.durationMinutes ?? 1)),
          source: (d.source as RoutePath["source"]) || "osrm_baseline",
          liveTraffic: false,
          guaranteedSafe: false,
        };
      }
    } catch {
      // Fallback straight-line calculation if routing service is offline
    }
    return buildStraightLineRoute(from, to);
  },

  async responderProfile(): Promise<{
    id: string;
    userId: string;
    unitCode: string;
    displayName: string;
    responderType: string;
    capabilities: ResponderCapability[];
    isOnDuty: boolean;
    availabilityStatus: ResponderAvailability;
    shareLocation: boolean;
    approved: boolean;
    lastLocation?: GeoPoint;
    lastPingAt?: string;
  } | null> {
    try {
      const res = await http.get("/responder/profile");
      const d = res.data as RawRecord;
      return {
        id: String(d.id),
        userId: String(d.userId || d.user_id || d.id),
        unitCode: String(d.unitCode || d.unit_code || "UNIT"),
        displayName: String(d.displayName || d.display_name || "Responder Unit"),
        responderType: String(d.responderType || d.responder_type || "campus_security"),
        capabilities: (Array.isArray(d.capabilities) ? d.capabilities : ["first_aid", "security_patrol"]) as ResponderCapability[],
        isOnDuty: Boolean(d.isOnDuty ?? d.is_on_duty ?? true),
        availabilityStatus: (d.availabilityStatus || d.availability_status || "available") as ResponderAvailability,
        shareLocation: Boolean(d.shareLocation ?? d.share_location ?? true),
        approved: Boolean(d.approved ?? d.is_approved ?? true),
        lastLocation: (d.lastLocation || d.last_location) as GeoPoint | undefined,
        lastPingAt: d.lastPingAt ? String(d.lastPingAt) : undefined,
      };
    } catch {
      return null;
    }
  },

  async requestDataDeletion(reason?: string): Promise<{
    ok: boolean;
    requestId: string;
    status: string;
    recordedAt: string;
    message: string;
  }> {
    const res = await http.post("/citizen/privacy/deletion-request", {
      reason: reason?.trim() || "Citizen requested personal data deletion",
    });
    return res.data as {
      ok: boolean;
      requestId: string;
      status: string;
      recordedAt: string;
      message: string;
    };
  },

  async updateOperatingArea(payload: {
    name?: string;
    polygon?: number[][];
    geojson?: { type: "Polygon"; coordinates: number[][][] };
  }): Promise<OperatingArea> {
    const res = await http.put("/admin/operating-area", payload);
    const d = res.data as RawRecord;
    return {
      id: String(d.id),
      name: String(d.name || "Bhopal Metro Zone"),
      polygon: Array.isArray(d.polygon) ? (d.polygon as number[][]) : [],
      srid: Number(d.srid ?? 4326),
      isActive: Boolean(d.isActive ?? d.is_active ?? true),
      createdAt: String(d.createdAt || d.created_at || new Date().toISOString()),
      geojson: d.geojson as OperatingArea["geojson"],
    };
  },
};

export const liveApi = api;
export default api;
