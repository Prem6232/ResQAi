import { describe, expect, it } from "vitest";
import { isMockEnabled, normalizeCategory, normalizeUrgency } from "./mock-api";

describe("api configuration & normalizers", () => {
  it("has mock mode disabled for live production backend", () => {
    expect(isMockEnabled()).toBe(false);
  });

  it("normalizes backend incident categories safely", () => {
    expect(normalizeCategory("fire_smoke")).toBe("fire_smoke");
    expect(normalizeCategory("sos")).toBe("personal_safety");
    expect(normalizeCategory("medical_emergency")).toBe("medical");
    expect(normalizeCategory("unrecognized_value")).toBe("other");
    expect(normalizeCategory(undefined)).toBe("other");
  });

  it("normalizes urgency levels safely", () => {
    expect(normalizeUrgency("critical")).toBe("critical");
    expect(normalizeUrgency("HIGH")).toBe("high");
    expect(normalizeUrgency("unknown")).toBe("high");
  });
});
