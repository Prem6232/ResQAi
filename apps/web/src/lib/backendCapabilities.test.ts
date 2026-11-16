import { afterEach, describe, expect, it, vi } from "vitest";
import { hasBackendRoute, resetBackendCapabilitiesCache } from "./backendCapabilities";

describe("backendCapabilities", () => {
  afterEach(() => {
    resetBackendCapabilitiesCache();
    vi.restoreAllMocks();
  });

  it("caches OpenAPI route inspection and checks /api/v1 prefixes safely", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        paths: {
          "/api/v1/routing/route": {},
          "/api/v1/responder/profile": {},
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await hasBackendRoute("/routing/route")).toBe(true);
    expect(await hasBackendRoute("/responder/profile")).toBe(true);
    expect(await hasBackendRoute("/nonexistent/route")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns false gracefully when OpenAPI spec cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await hasBackendRoute("/routing/route")).toBe(false);
  });
});
