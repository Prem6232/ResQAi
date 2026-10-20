import { API_BASE_URL, DEMO_CREDENTIALS } from "../config/api";
import {
  CitizenReport,
  NearbyAlert,
  TrustedContact,
  ResponderJob,
  IncidentCategory,
  Role,
} from "../types";

let currentAccessToken: string | null = null;
let currentRole: Role = "citizen";

export const mobileApi = {
  getAccessToken(): string | null {
    return currentAccessToken;
  },

  setAccessToken(token: string | null) {
    currentAccessToken = token;
  },

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (currentAccessToken) {
      headers["Authorization"] = `Bearer ${currentAccessToken}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  },

  // 1. Health Probe
  async checkHealth(): Promise<{ connected: boolean; status: string; database?: string; postgis?: string }> {
    try {
      const res = await this.request<{ status: string; database: string; postgis_version?: string }>("/health");
      return {
        connected: res.status === "healthy",
        status: res.status,
        database: res.database,
        postgis: res.postgis_version,
      };
    } catch (e) {
      return { connected: false, status: "offline" };
    }
  },

  // 2. Authentication
  async loginAs(role: Role): Promise<{ accessToken: string; user: any }> {
    currentRole = role;
    const creds = DEMO_CREDENTIALS[role] || DEMO_CREDENTIALS.citizen;
    const res = await this.request<{ access_token: string; accessToken?: string; user: any }>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email: creds.email, password: creds.password }),
      }
    );

    const token = res.access_token || res.accessToken || "";
    currentAccessToken = token;
    return { accessToken: token, user: res.user };
  },

  // 3. Citizen Reports
  async getCitizenReports(): Promise<CitizenReport[]> {
    try {
      const rawList = await this.request<any[]>("/citizen/reports");
      return rawList.map((item) => ({
        id: item.id,
        title: item.text?.slice(0, 40) || `Incident #${item.id.slice(0, 6)}`,
        category: (item.category as IncidentCategory) || "hazard",
        timestamp: new Date(item.created_at || item.createdAt || Date.now()).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        status: item.delivery_state === "cancelled" ? "false_alarm" : (item.processing_state as any) || "in_review",
        statusLabel: item.delivery_state || item.processing_state || "In review",
        currentStep: item.delivery_state === "delivered" ? 3 : 2,
        stepDetails: item.text,
        locationLabel: item.location_label || item.locationLabel || "Campus Quad",
      }));
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
    const lat = input.lat ?? 28.5452;
    const lng = input.lng ?? 77.2731;

    const payload = {
      category: input.category,
      text: input.text || input.title,
      location: {
        lat,
        lng,
        accuracy_meters: 5.0,
        source: "gps",
      },
      location_label: input.locationLabel || "Campus Quadrangle",
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
    };
  },

  async triggerSOS(coords?: { lat: number; lng: number }): Promise<CitizenReport> {
    const lat = coords?.lat ?? 28.5452;
    const lng = coords?.lng ?? 77.2731;

    const payload = {
      location: {
        lat,
        lng,
        accuracy_meters: 3.0,
        source: "gps",
      },
      location_label: "Live Emergency SOS Telemetry",
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
      locationLabel: "Main Quadrangle · Coordinates Broadcasted",
    };
  },

  // 4. Nearby Alerts
  async getNearbyAlerts(): Promise<NearbyAlert[]> {
    try {
      const list = await this.request<any[]>("/citizen/alerts");
      return list.map((item, idx) => ({
        id: item.id || `alert_${idx}`,
        title: item.title || "Campus Advisory",
        category: (item.category as IncidentCategory) || "hazard",
        distance: item.distance_label || item.distanceLabel || "300m away",
        distanceMeters: 300,
        locationLabel: item.location_label || item.locationLabel || "Campus Ground",
        description: item.status_label || item.statusLabel || "Active monitoring in progress",
        status: item.tone === "active" ? "active" : "in_review",
        badgeText: item.tone?.toUpperCase() || "ACTIVE",
        coordinate: { x: 50 + (idx * 15) % 40, y: 50 + (idx * 20) % 40 },
        urgency: "high",
        createdAt: "Active",
      }));
    } catch (e) {
      console.warn("Failed to fetch alerts from backend", e);
      return [];
    }
  },

  // 5. Trusted Contacts
  async getContacts(): Promise<TrustedContact[]> {
    try {
      const list = await this.request<any[]>("/citizen/contacts");
      return list.map((c) => ({
        id: c.id,
        name: c.name,
        initials: c.name.slice(0, 2).toUpperCase(),
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

  // 6. Responder Assignments
  async getResponderAssignments(): Promise<ResponderJob[]> {
    try {
      const list = await this.request<any[]>("/responder/assignments");
      return list.map((a, idx) => ({
        id: a.id,
        incidentNumber: idx + 101,
        title: a.incident_title || a.incidentTitle || `Assignment #${a.id.slice(0, 6)}`,
        category: (a.category as IncidentCategory) || "fire_smoke",
        urgency: (a.urgency as any) || "high",
        locationLabel: a.location_label || a.locationLabel || "North Campus Block C",
        distance: "450m",
        eta: "3 mins",
        timeAgo: "Live dispatch",
        status: a.status || "offered",
        aiSummary: a.notes || "Immediate field response requested.",
      }));
    } catch (e) {
      console.warn("Failed to fetch responder assignments", e);
      return [];
    }
  },

  async respondToOffer(assignmentId: string, accept: boolean): Promise<any> {
    return this.request(`/responder/offers/${assignmentId}/respond`, {
      method: "POST",
      body: JSON.stringify({ accept, reason: accept ? "Accepted by mobile responder" : "Declined by mobile responder" }),
    });
  },

  async updateAssignmentStatus(assignmentId: string, status: string): Promise<any> {
    return this.request(`/responder/assignments/${assignmentId}/status`, {
      method: "POST",
      body: JSON.stringify({ status, note: `Status updated to ${status} via mobile console.` }),
    });
  },

  async sendLocationPing(lat: number, lng: number): Promise<any> {
    return this.request("/responder/location-ping", {
      method: "POST",
      body: JSON.stringify({
        location: { lat, lng, accuracy_meters: 4.0, source: "gps" },
        battery_level: 95,
      }),
    });
  },
};
