import { mapConfig } from "@/config/map.config";
import type { SessionUser } from "@/types/auth";
import type { Assignment } from "@/types/assignment";
import type { EvidenceAssessment } from "@/types/ai-evidence";
import type { Incident } from "@/types/incident";
import type { NearbyAlert, ResponderProfile } from "@/types/responder";
import type { Report } from "@/types/report";
import { newId } from "./utils";

const C = mapConfig.campusCenter;

export const demoUsers: Array<SessionUser & { password: string }> = [
  {
    id: "usr_citizen",
    name: "Aisha Rahman",
    email: "citizen@campus.demo",
    password: "demo1234",
    roles: ["citizen"],
    activeRole: "citizen",
    campusName: "Northridge Campus (synthetic)",
  },
  {
    id: "usr_responder",
    name: "Rohit Nair",
    email: "responder@campus.demo",
    password: "demo1234",
    roles: ["responder"],
    activeRole: "responder",
    campusName: "Northridge Campus (synthetic)",
  },
  {
    id: "usr_operator",
    name: "Meera Kapoor",
    email: "operator@campus.demo",
    password: "demo1234",
    roles: ["operator"],
    activeRole: "operator",
    campusName: "Northridge Campus (synthetic)",
  },
  {
    id: "usr_admin",
    name: "Campus Admin",
    email: "admin@campus.demo",
    password: "demo1234",
    roles: ["admin"],
    activeRole: "admin",
    campusName: "Northridge Campus (synthetic)",
  },
];

function ago(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export const mockIncidents: Incident[] = [
  {
    id: "inc_402",
    publicCode: "402",
    category: "fire_smoke",
    urgency: "critical",
    status: "assigned",
    title: "Incident 402 · Fire & Smoke",
    location: { lat: C.lat + 0.0012, lng: C.lng + 0.001, source: "manual_map" },
    locationLabel: "Market road (synthetic)",
    reportIds: ["rep_1", "rep_2", "rep_3"],
    createdAt: ago(12),
    updatedAt: ago(4),
    evidenceLabel: "unverified",
    hidePreciseLocationFromPublic: false,
    synthetic: true,
  },
  {
    id: "inc_sos",
    publicCode: "SOS-19",
    category: "personal_safety",
    urgency: "critical",
    status: "under_review",
    title: "Personal SOS",
    location: { lat: C.lat - 0.0008, lng: C.lng + 0.0004, source: "gps", accuracyMeters: 18 },
    locationLabel: "Station road — coarsened for public map",
    reportIds: ["rep_4"],
    createdAt: ago(8),
    updatedAt: ago(8),
    evidenceLabel: "insufficient_evidence",
    hidePreciseLocationFromPublic: true,
    synthetic: true,
  },
  {
    id: "inc_acc",
    publicCode: "118",
    category: "road_accident",
    urgency: "high",
    status: "confirmed",
    title: "Road accident",
    location: { lat: C.lat + 0.0004, lng: C.lng - 0.0014, source: "manual_map" },
    locationLabel: "Bypass junction (synthetic)",
    reportIds: ["rep_5", "rep_6"],
    createdAt: ago(26),
    updatedAt: ago(10),
    evidenceLabel: "possible_duplicate",
    hidePreciseLocationFromPublic: false,
    synthetic: true,
  },
  {
    id: "inc_med",
    publicCode: "77",
    category: "medical",
    urgency: "medium",
    status: "resolved",
    title: "Medical emergency",
    location: { lat: C.lat - 0.0011, lng: C.lng - 0.0006, source: "gps" },
    locationLabel: "Library lawn (synthetic)",
    reportIds: ["rep_7"],
    createdAt: ago(1400),
    updatedAt: ago(1300),
    evidenceLabel: "confirmed_by_operator",
    hidePreciseLocationFromPublic: false,
    synthetic: true,
  },
];

export let mockReports: Report[] = [
  {
    id: "rep_1",
    reporterId: "usr_citizen",
    createdAt: ago(12),
    channel: "form",
    category: "road_accident",
    text: "Two-wheeler down near the east gate. People gathering.",
    location: { lat: C.lat, lng: C.lng, source: "gps", accuracyMeters: 12 },
    locationLabel: "East gate",
    media: [],
    processingState: "ai_complete",
    deliveryState: "received_by_server",
    incidentId: "inc_acc",
    synthetic: true,
  },
  {
    id: "rep_7",
    reporterId: "usr_citizen",
    createdAt: ago(1400),
    channel: "sos",
    category: "medical",
    text: "Student fainted after sports hour.",
    location: { lat: C.lat - 0.0011, lng: C.lng - 0.0006, source: "gps" },
    locationLabel: "Library lawn",
    media: [],
    processingState: "ai_complete",
    deliveryState: "received_by_server",
    incidentId: "inc_med",
    synthetic: true,
  },
];

export const mockResponders: ResponderProfile[] = [
  {
    id: "rsp_a12",
    userId: "usr_a12",
    unitCode: "A-12",
    displayName: "Ambulance A-12",
    type: "medical_volunteer",
    status: "available",
    capabilities: ["first_aid"],
    lastLocation: { lat: C.lat + 0.002, lng: C.lng - 0.001, source: "gps" },
    lastLocationAt: ago(2),
    shareLocation: true,
    approved: true,
    synthetic: true,
  },
  {
    id: "rsp_f2",
    userId: "usr_responder",
    unitCode: "F-2",
    displayName: "Fire unit F-2",
    type: "fire_warden",
    status: "busy",
    capabilities: ["firefighting", "rescue", "hazard"],
    lastLocation: { lat: C.lat + 0.001, lng: C.lng + 0.0008, source: "gps" },
    lastLocationAt: ago(1),
    currentJob: "Incident 402",
    shareLocation: true,
    approved: true,
    synthetic: true,
  },
  {
    id: "rsp_p07",
    userId: "usr_p07",
    unitCode: "P-07",
    displayName: "Campus security P-07",
    type: "campus_security",
    status: "available",
    capabilities: ["security_patrol"],
    lastLocation: { lat: C.lat - 0.0015, lng: C.lng + 0.0012, source: "gps" },
    lastLocationAt: ago(3),
    shareLocation: true,
    approved: true,
    synthetic: true,
  },
  {
    id: "rsp_v21",
    userId: "usr_v21",
    unitCode: "V-21",
    displayName: "Volunteer V-21",
    type: "volunteer",
    status: "offline",
    capabilities: ["first_aid"],
    lastLocationAt: ago(40),
    shareLocation: false,
    approved: true,
    synthetic: true,
  },
];

export let mockAssignments: Assignment[] = [
  {
    id: "asg_402",
    incidentId: "inc_402",
    responderId: "rsp_f2",
    slotId: "slot_fire_1",
    status: "en_route",
    offeredAt: ago(6),
    acknowledgedAt: ago(5),
    etaMinutes: 4,
    distanceKm: 0.7,
    routeNote: "Baseline road route · not live traffic · not guaranteed safe",
    synthetic: true,
  },
  {
    id: "asg_offer",
    incidentId: "inc_402",
    responderId: "rsp_f2",
    slotId: "slot_fire_1",
    status: "offered",
    offeredAt: ago(1),
    etaMinutes: 5,
    distanceKm: 0.9,
    synthetic: true,
  },
];

export const mockEvidence: Record<string, EvidenceAssessment> = {
  inc_402: {
    linkedReports: 3,
    temporalConsistency: "aligned",
    locationConsistency: "aligned",
    reusedMediaFlag: false,
    corroboratingVisual: true,
    missing: ["Wind direction", "Whether people are still inside"],
    conflicting: [],
    text: {
      suggestedCategory: "fire_smoke",
      suggestedUrgency: "high",
      modelScore: 0.91,
      scoreMeaning: "Relative classifier score, not probability the incident is real.",
      reviewRequired: true,
      explanation: "Keywords: smoke, shop, people outside. Demo adapter — not a live model.",
      modelVersion: "text-demo-0.1",
    },
    vision: {
      pipeline: "fire_smoke",
      finding: "possible_fire_smoke_evidence",
      modelScore: 0.88,
      adapter: "labelled_demo_adapter",
      modelVersion: "vision-demo-0.1",
    },
    duplicates: [
      {
        incidentId: "inc_acc",
        score: 0.22,
        signals: ["nearby in time"],
        recommendation: "weak",
      },
    ],
  },
};

export const nearbyAlerts: NearbyAlert[] = [
  {
    id: "al_1",
    category: "fire_smoke",
    title: "Fire & Smoke",
    distanceLabel: "400 m away",
    statusLabel: "Emergency services contacted",
    tone: "active",
    coarsened: true,
  },
  {
    id: "al_2",
    category: "road_accident",
    title: "Road block, accident",
    distanceLabel: "800 m away",
    statusLabel: "Expect delays",
    tone: "caution",
    coarsened: true,
  },
];

export const trustedContactsSeed = [
  { id: "tc_1", name: "Aarav Sharma", relation: "Brother", status: "Active" as const },
  { id: "tc_2", name: "Priya Mehta", relation: "Friend", status: "Active" as const },
  { id: "tc_3", name: "Ravi Khanna", relation: "Neighbour", status: "Pending" as const },
];

export function addCitizenReport(partial: Omit<Report, "id" | "synthetic" | "reporterId">) {
  const report: Report = {
    ...partial,
    id: newId("rep"),
    reporterId: "usr_citizen",
    synthetic: true,
  };
  mockReports = [report, ...mockReports];
  return report;
}

export function healthPayload() {
  return {
    status: "ok" as const,
    service: "sentinelgrid-web-mock",
    postgis: apiConfigHint(),
    demo: true,
    timestamp: new Date().toISOString(),
  };
}

function apiConfigHint() {
  return {
    connected: true,
    note: "Frontend mock health. Real PostGIS connectivity is a backend check.",
  };
}
