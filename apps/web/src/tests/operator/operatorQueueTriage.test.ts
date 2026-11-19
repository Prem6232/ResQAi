import { describe, expect, it } from "vitest";
import type { Incident, Urgency } from "@/types/incident";
import { urgencyMeta } from "@/lib/categories";

describe("Operator Queue Triage & Urgency Prioritization Suite", () => {
  const sampleIncidents: Incident[] = [
    {
      id: "inc-1",
      publicCode: "INC-001",
      title: "Routine maintenance report",
      category: "other",
      urgency: "low",
      status: "reported",
      location: { lat: 23.2599, lng: 77.4126, source: "gps" },
      locationLabel: "Bhopal Junction",
      reportIds: ["rep-1"],
      createdAt: "2026-11-19T09:00:00Z",
      updatedAt: "2026-11-19T09:00:00Z",
      evidenceLabel: "unverified",
      hidePreciseLocationFromPublic: false,
      synthetic: false,
    },
    {
      id: "inc-2",
      publicCode: "INC-002",
      title: "Personal SOS - Citizen in Distress",
      category: "personal_safety",
      urgency: "critical",
      status: "reported",
      location: { lat: 23.2332, lng: 77.4343, source: "gps" },
      locationLabel: "MP Nagar Zone II, Bhopal",
      reportIds: ["rep-2", "rep-3"],
      createdAt: "2026-11-19T09:05:00Z",
      updatedAt: "2026-11-19T09:05:00Z",
      evidenceLabel: "confirmed_by_operator",
      hidePreciseLocationFromPublic: true,
      synthetic: false,
    },
    {
      id: "inc-3",
      publicCode: "INC-003",
      title: "Commercial Kitchen Fire Hazard",
      category: "fire_smoke",
      urgency: "high",
      status: "assigned",
      location: { lat: 23.2082, lng: 77.461, source: "gps" },
      locationLabel: "AIIMS Road, Bhopal",
      reportIds: ["rep-4"],
      createdAt: "2026-11-19T09:02:00Z",
      updatedAt: "2026-11-19T09:02:00Z",
      evidenceLabel: "unverified",
      hidePreciseLocationFromPublic: false,
      synthetic: false,
    },
    {
      id: "inc-4",
      publicCode: "INC-004",
      title: "Old minor water leak - resolved",
      category: "other",
      urgency: "low",
      status: "resolved",
      location: { lat: 23.268, lng: 77.382, source: "gps" },
      locationLabel: "VIP Road, Bhopal",
      reportIds: ["rep-5"],
      createdAt: "2026-11-19T07:00:00Z",
      updatedAt: "2026-11-19T08:00:00Z",
      evidenceLabel: "confirmed_by_operator",
      hidePreciseLocationFromPublic: false,
      synthetic: false,
    },
  ];

  it("filters out resolved and closed incidents from active operator queue", () => {
    const active = sampleIncidents.filter(
      (i) => !["resolved", "closed", "cancelled"].includes(i.status)
    );

    expect(active).toHaveLength(3);
    expect(active.some((i) => i.id === "inc-4")).toBe(false);
  });

  it("sorts incidents prioritizing CRITICAL SOS urgency before high, medium, and low", () => {
    const urgencyWeight: Record<Urgency, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    const active = sampleIncidents.filter(
      (i) => !["resolved", "closed", "cancelled"].includes(i.status)
    );

    const prioritized = [...active].sort(
      (a, b) => urgencyWeight[b.urgency] - urgencyWeight[a.urgency]
    );

    expect(prioritized[0].id).toBe("inc-2"); // Critical SOS
    expect(prioritized[0].urgency).toBe("critical");
    expect(prioritized[1].id).toBe("inc-3"); // High Fire
    expect(prioritized[1].urgency).toBe("high");
    expect(prioritized[2].id).toBe("inc-1"); // Low Routine
    expect(prioritized[2].urgency).toBe("low");
  });

  it("maps urgency meta classes correctly for operator UI badges", () => {
    expect(urgencyMeta.critical.label).toBe("Critical");
    expect(urgencyMeta.high.label).toBe("High");
    expect(urgencyMeta.medium.label).toBe("Medium");
    expect(urgencyMeta.low.label).toBe("Low");
  });

  it("ensures live operator incidents display Bhopal locations without synthetic flags", () => {
    for (const inc of sampleIncidents) {
      expect(inc.synthetic).toBe(false);
      expect(inc.locationLabel).toMatch(/Bhopal/i);
    }
  });
});
