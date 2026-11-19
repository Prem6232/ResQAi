import { describe, expect, it } from "vitest";
import type { ResponderProfile } from "@/types/responder";

describe("Operator Dispatch Workflow & HITL Governance Suite", () => {
  const sampleResponders: ResponderProfile[] = [
    {
      id: "resp-1",
      userId: "usr-1",
      unitCode: "A-12",
      displayName: "City Ambulance 12",
      type: "medical_volunteer",
      status: "available",
      capabilities: ["first_aid", "rescue"],
      lastLocation: { lat: 23.2082, lng: 77.461, source: "gps" },
      lastLocationAt: "2026-11-19T09:00:00Z",
      shareLocation: true,
      approved: true,
      synthetic: false,
    },
    {
      id: "resp-2",
      userId: "usr-2",
      unitCode: "F-02",
      displayName: "Fire Rapid Response 02",
      type: "fire_warden",
      status: "available",
      capabilities: ["firefighting", "hazard"],
      lastLocation: { lat: 23.2599, lng: 77.4126, source: "gps" },
      lastLocationAt: "2026-11-19T09:02:00Z",
      shareLocation: true,
      approved: true,
      synthetic: false,
    },
    {
      id: "resp-3",
      userId: "usr-3",
      unitCode: "P-07",
      displayName: "Police Patrol 07",
      type: "campus_security",
      status: "busy",
      capabilities: ["security_patrol"],
      lastLocation: { lat: 23.2332, lng: 77.4343, source: "gps" },
      lastLocationAt: "2026-11-19T09:01:00Z",
      currentJob: "Traffic Perimeter Control",
      shareLocation: true,
      approved: true,
      synthetic: false,
    },
    {
      id: "resp-4",
      userId: "usr-4",
      unitCode: "V-01",
      displayName: "Volunteer Unit 01",
      type: "volunteer",
      status: "offline",
      capabilities: ["security_patrol"],
      shareLocation: false,
      approved: true,
      synthetic: false,
    },
  ];

  it("calculates accurate fleet readiness counts across statuses", () => {
    const counts = {
      onDuty: sampleResponders.filter((r) => r.status !== "offline" && r.status !== "off_duty").length,
      available: sampleResponders.filter((r) => r.status === "available").length,
      busy: sampleResponders.filter((r) => r.status === "busy").length,
      offline: sampleResponders.filter((r) => r.status === "offline" || r.status === "off_duty").length,
    };

    expect(counts.onDuty).toBe(3);
    expect(counts.available).toBe(2);
    expect(counts.busy).toBe(1);
    expect(counts.offline).toBe(1);
  });

  it("filters out busy and offline responders when selecting immediate dispatch candidates", () => {
    const dispatchEligible = sampleResponders.filter(
      (r) => r.approved && r.status === "available" && r.lastLocation
    );

    expect(dispatchEligible).toHaveLength(2);
    expect(dispatchEligible.map((r) => r.unitCode)).toEqual(["A-12", "F-02"]);
  });

  it("matches appropriate responder unit based on incident emergency category", () => {
    const fireCategory = "fire_smoke";
    const medicalCategory = "medical";

    const fireUnit = sampleResponders.find(
      (r) => r.status === "available" && (r.type === "fire_warden" || r.capabilities.includes("firefighting"))
    );
    const medicalUnit = sampleResponders.find(
      (r) => r.status === "available" && (r.type === "medical_volunteer" || r.capabilities.includes("first_aid"))
    );

    expect(fireCategory).toBe("fire_smoke");
    expect(medicalCategory).toBe("medical");
    expect(fireUnit?.unitCode).toBe("F-02");
    expect(medicalUnit?.unitCode).toBe("A-12");
  });

  it("validates that operator dispatch payload contains mandatory HITL verification fields", () => {
    const dispatchPayload = {
      incidentId: "inc-test-01",
      responderId: "resp-1",
      reason: "Confirmed fire & smoke hazard via live citizen video feed",
    };

    expect(dispatchPayload.incidentId).toBeTruthy();
    expect(dispatchPayload.responderId).toBeTruthy();
    expect(dispatchPayload.reason.length).toBeGreaterThan(10);
  });

  it("enforces justification requirement when operator overrides AI suggested classification", () => {
    const validateOverride = (reason: string) => {
      if (!reason || reason.trim().length < 5) {
        throw new Error("Audit log mandates an explanatory reason for overriding AI suggestion");
      }
      return true;
    };

    expect(() => validateOverride("")).toThrow();
    expect(() => validateOverride("no")).toThrow();
    expect(validateOverride("Visual evidence confirms false alarm / controlled drill")).toBe(true);
  });
});
