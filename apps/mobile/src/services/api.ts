import { API_BASE_URL, DEMO_CREDENTIALS } from "../config/api";
import {
  CitizenReport,
  NearbyAlert,
  TrustedContact,
  ResponderJob,
  ResponderProfile,
  IncidentCategory,
  Role,
  OperatorKPISummary,
  MapIncidentItem,
  MapResponderItem,
  GeoPoint,
  UserProfile,
} from "../types";

let currentAccessToken: string | null = null;
let currentRole: Role = "citizen";
let currentUser: UserProfile | null = null;
let authPromise: Promise<string> | null = null;
let connectionListeners: Array<(connected: boolean) => void> = [];
let lastKnownConnectionState: boolean | null = null;

function notifyConnection(connected: boolean) {
  if (lastKnownConnectionState !== connected) {
    lastKnownConnectionState = connected;
    connectionListeners.forEach((l) => l(connected));
  }
}

export const mobileApi = {
  getAccessToken(): string | null {
    return currentAccessToken;
  },

  setAccessToken(token: string | null) {
    currentAccessToken = token;
  },

  getRole(): Role {
    return currentRole;
  },

  onConnectionChange(listener: (connected: boolean) => void): () => void {
    connectionListeners.push(listener);
    if (lastKnownConnectionState !== null) {
      listener(lastKnownConnectionState);
    }
    return () => {
      connectionListeners = connectionListeners.filter((l) => l !== listener);
    };
  },

  async ensureAuthenticated(): Promise<string> {
    if (currentAccessToken) return currentAccessToken;
    if (authPromise) return authPromise;

    authPromise = (async () => {
      try {
        const res = await this.loginAs(currentRole);
        return res.accessToken;
      } finally {
        authPromise = null;
      }
    })();
    return authPromise;
  },

  async request<T>(endpoint: string, options: RequestInit = {}, retryCount = 1): Promise<T> {
    const isPublic = endpoint.startsWith("/auth/login") || endpoint.startsWith("/auth/register") || endpoint === "/health";
    
    // Auto-authenticate if token is missing
    if (!isPublic && !currentAccessToken) {
      try {
        await this.ensureAuthenticated();
      } catch (authErr) {
        console.warn("Auto authentication on demand warning:", authErr);
      }
    }

    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (currentAccessToken && !headers["Authorization"]) {
      headers["Authorization"] = `Bearer ${currentAccessToken}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout for cold start and cellular

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      // If token expired or invalid, auto-refresh and retry once
      if (response.status === 401 && retryCount > 0 && !isPublic) {
        currentAccessToken = null;
        await this.loginAs(currentRole);
        return this.request<T>(endpoint, options, retryCount - 1);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }

      notifyConnection(true);
      return (await response.json()) as T;
    } catch (err: any) {
      // Retry once on network timeout/abort
      if (retryCount > 0 && (err?.name === "AbortError" || err?.message?.includes("Network request failed"))) {
        return this.request<T>(endpoint, options, retryCount - 1);
      }
      notifyConnection(false);
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  },

  // 1. Health Probe
  async checkHealth(): Promise<{ connected: boolean; status: string; database?: string; postgis?: string }> {
    try {
      const res = await this.request<{ status: string; database: string; postgis_version?: string }>("/health");
      const isHealthy = res.status === "healthy" || res.status === "ok";
      notifyConnection(isHealthy);
      return {
        connected: isHealthy,
        status: res.status,
        database: res.database,
        postgis: res.postgis_version,
      };
    } catch {
      notifyConnection(false);
      return { connected: false, status: "offline" };
    }
  },

  // 2. Authentication
  getCurrentUser(): UserProfile | null {
    return currentUser;
  },

  async login(email: string, password: string): Promise<{ accessToken: string; user: UserProfile }> {
    const res = await this.request<{ access_token: string; accessToken?: string; user: any }>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      }
    );

    const token = res.access_token || res.accessToken || "";
    currentAccessToken = token;
    const rawUser = res.user || {};
    const parsedRole: Role = rawUser.role === "responder" ? "responder" : "citizen";
    currentRole = parsedRole;

    currentUser = {
      id: rawUser.id || "",
      email: rawUser.email || email,
      fullName: rawUser.full_name || rawUser.fullName || rawUser.name || "User",
      name: rawUser.name || rawUser.full_name || "User",
      role: parsedRole,
      phone: rawUser.phone,
      campusName: rawUser.campus_name || rawUser.campusName || "Bhopal Emergency Zone",
    };

    notifyConnection(true);
    return { accessToken: token, user: currentUser };
  },

  async register(payload: {
    email: string;
    password: string;
    fullName: string;
    role: Role;
    phone?: string;
    unitCode?: string;
  }): Promise<{ accessToken: string; user: UserProfile }> {
    const res = await this.request<{ access_token: string; accessToken?: string; user: any }>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify({
          email: payload.email.trim(),
          password: payload.password,
          full_name: payload.fullName.trim(),
          name: payload.fullName.trim(),
          role: payload.role,
          phone: payload.phone?.trim() || undefined,
          responder_type: payload.role === "responder" ? "campus_security" : undefined,
          capabilities: payload.role === "responder" ? ["first_aid", "security_patrol", "rescue"] : undefined,
        }),
      }
    );

    const token = res.access_token || res.accessToken || "";
    currentAccessToken = token;
    currentRole = payload.role;

    const rawUser = res.user || {};
    currentUser = {
      id: rawUser.id || "",
      email: rawUser.email || payload.email,
      fullName: payload.fullName,
      name: payload.fullName,
      role: payload.role,
      phone: payload.phone,
      campusName: "Bhopal Emergency Zone",
    };

    notifyConnection(true);
    return { accessToken: token, user: currentUser };
  },

  async loginAs(role: Role): Promise<{ accessToken: string; user: any }> {
    currentRole = role;
    const creds = DEMO_CREDENTIALS[role] || DEMO_CREDENTIALS.citizen;
    return this.login(creds.email, creds.password);
  },

  logout(): void {
    currentAccessToken = null;
    currentUser = null;
  },

  async getMe(): Promise<any> {
    return this.request("/auth/me");
  },

  // 3. Citizen Reports
  async getCitizenReports(): Promise<CitizenReport[]> {
    try {
      const rawList = await this.request<any[]>("/citizen/reports");
      return (rawList || []).map((item) => {
        let lat = 23.2599;
        let lng = 77.4126;
        if (item.location) {
          lat = typeof item.location.lat === "number" ? item.location.lat : lat;
          lng = typeof item.location.lng === "number" ? item.location.lng : lng;
        }

        const isResolved = item.delivery_state === "delivered" || item.processing_state === "resolved";
        const isDispatched = item.processing_state === "verified" || item.processing_state === "dispatched";

        let currentStep = 1;
        if (isResolved) currentStep = 4;
        else if (isDispatched) currentStep = 3;
        else if (item.processing_state === "in_review" || item.processing_state === "triaged") currentStep = 2;

        return {
          id: item.id,
          title: item.text?.slice(0, 48) || `Incident #${item.id.slice(0, 6)}`,
          category: (item.category as IncidentCategory) || "hazard",
          timestamp: new Date(item.created_at || item.createdAt || Date.now()).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          status: item.delivery_state === "cancelled" ? "false_alarm" : (item.processing_state as any) || "in_review",
          statusLabel: item.delivery_state || item.processing_state || "In review",
          currentStep,
          stepDetails: item.text || "Report logged in PostGIS grid.",
          locationLabel: item.location_label || item.locationLabel || "Bhopal City Center",
          location: { lat, lng },
        };
      });
    } catch (e) {
      console.warn("Failed to fetch citizen reports from backend", e);
      return [];
    }
  },

  async createReport(input: {
    category: IncidentCategory;
    title: string;
    text: string;
    locationLabel: string;
    lat?: number;
    lng?: number;
  }): Promise<CitizenReport> {
    const lat = input.lat ?? 23.2599;
    const lng = input.lng ?? 77.4126;

    const payload = {
      category: input.category,
      text: input.text || input.title,
      location: {
        lat,
        lng,
        accuracy_meters: 5.0,
        source: "gps",
      },
      location_label: input.locationLabel || "Bhopal City Center",
      channel: input.category === "personal_sos" ? "sos" : "form",
      urgency: input.category === "personal_sos" ? "critical" : "high",
      idempotency_key: `rep_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    };

    const res = await this.request<any>("/citizen/reports", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return {
      id: res.id,
      title: input.title,
      category: input.category,
      timestamp: "Just now",
      status: "in_review",
      statusLabel: "Received & Logged in DB",
      currentStep: 2,
      stepDetails: "Persisted in PostgreSQL PostGIS, queued for operator triage.",
      locationLabel: input.locationLabel,
      location: { lat, lng },
    };
  },

  async triggerSOS(coords?: { lat: number; lng: number }): Promise<CitizenReport> {
    const lat = coords?.lat ?? 23.2599;
    const lng = coords?.lng ?? 77.4126;

    const payload = {
      location: {
        lat,
        lng,
        accuracy_meters: 3.0,
        source: "gps",
      },
      location_label: "Live Emergency SOS Telemetry (Bhopal)",
      note: "Urgent SOS button activated from mobile app.",
      idempotency_key: `sos_${Date.now()}`,
    };

    const res = await this.request<any>("/citizen/sos", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return {
      id: res.id,
      title: "CRITICAL PERSONAL SOS",
      category: "personal_sos",
      timestamp: "Just now",
      status: "verified",
      statusLabel: "Dispatched",
      currentStep: 3,
      stepDetails: "Critical alert broadcasted to Security & Medical teams.",
      locationLabel: "Bhopal Central · Coordinates Broadcasted",
      location: { lat, lng },
    };
  },

  // 4. Nearby Alerts
  async getNearbyAlerts(coords?: { lat: number; lng: number }): Promise<NearbyAlert[]> {
    const lat = coords?.lat ?? 23.2599;
    const lng = coords?.lng ?? 77.4126;

    try {
      const list = await this.request<any[]>(`/citizen/alerts/nearby?lat=${lat}&lng=${lng}`);
      return (list || []).map((item, idx) => {
        let alertLat = lat + ((idx % 3) - 1) * 0.0015;
        let alertLng = lng + ((idx % 2) - 0.5) * 0.002;
        if (item.location && typeof item.location.lat === "number") {
          alertLat = item.location.lat;
          alertLng = item.location.lng;
        }

        return {
          id: item.id || `alert_${idx}`,
          title: item.title || "Campus Safety Notice",
          category: (item.category as IncidentCategory) || "hazard",
          distance: item.distance_label || item.distanceLabel || "150m away",
          distanceMeters: 150,
          locationLabel: item.location_label || item.locationLabel || "Campus Perimeter",
          description: item.status_label || item.statusLabel || "Active monitoring in progress",
          status: item.tone === "active" ? "active" : "in_review",
          badgeText: item.tone?.toUpperCase() || (item.status ? String(item.status).toUpperCase() : "ACTIVE"),
          coordinate: { x: 50 + ((idx * 15) % 40), y: 50 + ((idx * 20) % 40) },
          location: { lat: alertLat, lng: alertLng },
          tone: item.tone || "active",
          urgency: item.tone === "active" ? "high" : "medium",
          createdAt: "Active",
        };
      });
    } catch (e) {
      console.warn("Failed to fetch alerts from backend", e);
      return [];
    }
  },

  // 5. Trusted Contacts
  async getContacts(): Promise<TrustedContact[]> {
    try {
      const list = await this.request<any[]>("/citizen/contacts");
      return (list || []).map((c) => ({
        id: c.id,
        name: c.name,
        initials: (c.name || "EC").slice(0, 2).toUpperCase(),
        relation: c.relationship_label || c.relationshipLabel || "Emergency Contact",
        phone: c.phone,
        status: c.is_active ? "active" : "pending",
      }));
    } catch (e) {
      console.warn("Failed to fetch contacts", e);
      return [];
    }
  },

  async addContact(input: { name: string; phone: string; relation: string }): Promise<TrustedContact> {
    const res = await this.request<any>("/citizen/contacts", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        phone: input.phone,
        relationship_label: input.relation,
      }),
    });

    return {
      id: res.id,
      name: res.name,
      initials: res.name.slice(0, 2).toUpperCase(),
      relation: res.relationship_label || res.relationshipLabel || input.relation,
      phone: res.phone,
      status: "active",
    };
  },

  async deleteContact(id: string): Promise<void> {
    await this.request(`/citizen/contacts/${id}`, { method: "DELETE" });
  },

  // 6. Responder Endpoints
  async getResponderProfile(): Promise<ResponderProfile | null> {
    try {
      const p = await this.request<any>("/responder/profile");
      let lastLoc: GeoPoint | undefined;
      if (p.lastLocation) {
        lastLoc = {
          lat: Number(p.lastLocation.lat || 23.2599),
          lng: Number(p.lastLocation.lng || 77.4126),
        };
      }
      return {
        unitCode: p.unitCode || "F-2",
        unitName: p.displayName || `Unit ${p.unitCode}`,
        station: "Bhopal Central Emergency Station",
        crewCount: 4,
        isOnDuty: Boolean(p.isOnDuty),
        availability: p.availabilityStatus || "available",
        skills: p.capabilities || ["first_aid", "firefighting", "rescue"],
        shareLiveLocation: Boolean(p.shareLocation),
        alertSound: true,
        todayJobsCount: 4,
        avgArrivalMinutes: 3.5,
        acceptanceRatePct: 98,
        lastLocation: lastLoc,
      };
    } catch (e) {
      console.warn("Failed to fetch responder profile", e);
      return null;
    }
  },

  async updateDuty(isOnDuty: boolean, availabilityStatus: string = "available"): Promise<any> {
    return this.request("/responder/duty", {
      method: "PATCH",
      body: JSON.stringify({
        isOnDuty,
        availabilityStatus: isOnDuty ? availabilityStatus : "off_duty",
      }),
    });
  },

  async sendLocationPing(lat: number, lng: number): Promise<any> {
    return this.request("/responder/location", {
      method: "POST",
      body: JSON.stringify({ lat, lng, source: "gps" }),
    });
  },

  async getResponderAssignments(): Promise<ResponderJob[]> {
    try {
      const list = await this.request<any[]>("/responder/assignments");
      return (list || []).map((a, idx) => {
        const inc = a.incident || {};
        let loc: GeoPoint | undefined;
        if (inc.location && typeof inc.location.lat === "number") {
          loc = { lat: inc.location.lat, lng: inc.location.lng };
        }

        const distKm = a.distanceKm ?? a.distance_km ?? 0.45;
        const etaMin = a.etaMinutes ?? a.eta_minutes ?? 3;

        return {
          id: a.id,
          incidentNumber: idx + 101,
          incidentId: a.incidentId || a.incident_id,
          title: inc.title || a.incidentTitle || `Assignment #${a.id.slice(0, 6)}`,
          category: (inc.category as IncidentCategory) || "fire_smoke",
          urgency: (inc.urgency as any) || "high",
          locationLabel: inc.locationLabel || inc.location_label || "North Campus Block C",
          location: loc,
          distance: `${distKm.toFixed(1)} km`,
          distanceKm: distKm,
          eta: `${etaMin} min`,
          etaMinutes: etaMin,
          timeAgo: "Live dispatch",
          status: a.status || "offered",
          aiSummary: a.routeNote || a.notes || "Immediate field response requested.",
          routeNote: a.routeNote,
        };
      });
    } catch (e) {
      console.warn("Failed to fetch responder assignments", e);
      return [];
    }
  },

  async getResponderHistory(): Promise<ResponderJob[]> {
    try {
      const list = await this.request<any[]>("/responder/history");
      return (list || []).map((a, idx) => {
        const inc = a.incident || {};
        return {
          id: a.id,
          incidentNumber: idx + 201,
          incidentId: a.incidentId || a.incident_id,
          title: inc.title || `Mission #${a.id.slice(0, 6)}`,
          category: (inc.category as IncidentCategory) || "hazard",
          urgency: (inc.urgency as any) || "medium",
          locationLabel: inc.locationLabel || "Campus Zone",
          distance: `${(a.distanceKm || 0.8).toFixed(1)} km`,
          eta: "Resolved",
          timeAgo: "Completed",
          status: a.status || "completed",
        };
      });
    } catch {
      return [];
    }
  },

  async respondToOffer(assignmentId: string, accept: boolean): Promise<any> {
    return this.request(`/responder/offers/${assignmentId}/respond`, {
      method: "POST",
      body: JSON.stringify({
        status: accept ? "accepted" : "declined",
        reason: accept ? "Accepted by field responder" : "Declined by field responder",
      }),
    });
  },

  async updateAssignmentStatus(assignmentId: string, status: string, reason?: string): Promise<any> {
    return this.request(`/responder/assignments/${assignmentId}/status`, {
      method: "POST",
      body: JSON.stringify({
        status,
        reason: reason || `Transitioned to ${status} from mobile console.`,
      }),
    });
  },

  async addAssignmentNotes(assignmentId: string, notes: string): Promise<any> {
    return this.request(`/responder/assignments/${assignmentId}/notes`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    });
  },

  // 7. Operator & Analytics Endpoints
  async getOperatorIncidents(): Promise<MapIncidentItem[]> {
    try {
      const list = await this.request<any[]>("/operator/incidents");
      return (list || []).map((item) => {
        let lat = 23.2599;
        let lng = 77.4126;
        if (item.location && typeof item.location.lat === "number") {
          lat = item.location.lat;
          lng = item.location.lng;
        }

        return {
          id: item.id,
          title: item.title || `Incident #${item.publicCode || item.id.slice(0, 6)}`,
          category: (item.category as IncidentCategory) || "hazard",
          urgency: item.urgency || "high",
          location: { lat, lng },
          locationLabel: item.locationLabel || item.location_label || "Bhopal Perimeter",
          status: item.status || "reported",
          tone: item.status === "resolved" ? "resolved" : item.urgency === "critical" ? "active" : "caution",
        };
      });
    } catch (e) {
      console.warn("Failed to fetch operator incidents", e);
      return [];
    }
  },

  async getOperatorResponders(): Promise<MapResponderItem[]> {
    try {
      const list = await this.request<any[]>("/operator/responders");
      return (list || []).map((r) => {
        let lat = 23.2599;
        let lng = 77.4126;
        if (r.location && typeof r.location.lat === "number") {
          lat = r.location.lat;
          lng = r.location.lng;
        }

        return {
          id: r.id,
          unitCode: r.unitCode || r.unit_code || "Unit",
          displayName: r.displayName || r.display_name || r.unitCode || "Responder",
          responderType: r.responderType || r.responder_type || "campus_security",
          isOnDuty: Boolean(r.isOnDuty ?? r.is_on_duty ?? true),
          availabilityStatus: r.availabilityStatus || r.availability_status || "available",
          location: { lat, lng },
        };
      });
    } catch (e) {
      console.warn("Failed to fetch operator responders", e);
      return [];
    }
  },

  async getAnalyticsSummary(): Promise<OperatorKPISummary | null> {
    try {
      return await this.request<OperatorKPISummary>("/analytics/summary");
    } catch {
      return null;
    }
  },

  async dispatchResponder(incidentId: string, responderId: string, note?: string): Promise<any> {
    return this.request("/operator/actions/dispatch", {
      method: "POST",
      body: JSON.stringify({
        incidentId,
        responderId,
        note: note || "Immediate mobile dispatch order issued.",
      }),
    });
  },

  async getWalkwayRoute(from: GeoPoint, to: GeoPoint): Promise<{ distanceKm: number; durationMinutes: number; coordinates: Array<[number, number]> }> {
    try {
      const url = `/routing/route?from_lat=${from.lat}&from_lng=${from.lng}&to_lat=${to.lat}&to_lng=${to.lng}&profile=foot`;
      return await this.request<any>(url);
    } catch {
      // Direct straight line fallback if routing engine is unreachable
      return {
        distanceKm: 0.25,
        durationMinutes: 3,
        coordinates: [
          [from.lat, from.lng],
          [(from.lat + to.lat) / 2, from.lng],
          [to.lat, to.lng],
        ],
      };
    }
  },
};
