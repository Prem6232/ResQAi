import { describe, expect, it } from "vitest";
import { isMockEnabled } from "./mock-api";

describe("api configuration", () => {
  it("has mock mode disabled for live production backend", () => {
    expect(isMockEnabled()).toBe(false);
  });
});
