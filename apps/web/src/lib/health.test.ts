import { describe, expect, it } from "vitest";
import { healthPayload } from "./mock-store";

describe("mock health", () => {
  it("returns ok without claiming PostGIS is live", () => {
    const h = healthPayload();
    expect(h.status).toBe("ok");
    expect(h.demo).toBe(true);
  });
});
