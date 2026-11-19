import { describe, expect, it } from "vitest";
import {
  BHOPAL_METRO_BOUNDS,
  BHOPAL_METRO_CENTER,
  isWithinBhopal,
  sanitizeToBhopal,
  computeGeoBounds,
} from "@/components/maps/liveResponderMapUtils";

describe("Operator Bhopal Metropolitan Geofence & Sanitation Suite", () => {
  it("enforces strict Bhopal bounding coordinates", () => {
    expect(BHOPAL_METRO_BOUNDS.minLat).toBeLessThan(BHOPAL_METRO_CENTER.lat);
    expect(BHOPAL_METRO_BOUNDS.maxLat).toBeGreaterThan(BHOPAL_METRO_CENTER.lat);
    expect(BHOPAL_METRO_BOUNDS.minLng).toBeLessThan(BHOPAL_METRO_CENTER.lng);
    expect(BHOPAL_METRO_BOUNDS.maxLng).toBeGreaterThan(BHOPAL_METRO_CENTER.lng);

    // Bhopal center check
    expect(BHOPAL_METRO_CENTER.lat).toBeCloseTo(23.2599, 4);
    expect(BHOPAL_METRO_CENTER.lng).toBeCloseTo(77.4126, 4);
  });

  it("identifies real Bhopal landmarks as inside Bhopal", () => {
    const bhopalStation = { lat: 23.2688, lng: 77.4116 };
    const mpNagar = { lat: 23.2332, lng: 77.4343 };
    const aiimsBhopal = { lat: 23.2082, lng: 77.461 };
    const upperLakeVipRoad = { lat: 23.268, lng: 77.382 };

    expect(isWithinBhopal(bhopalStation)).toBe(true);
    expect(isWithinBhopal(mpNagar)).toBe(true);
    expect(isWithinBhopal(aiimsBhopal)).toBe(true);
    expect(isWithinBhopal(upperLakeVipRoad)).toBe(true);
  });

  it("strictly rejects out-of-bounds legacy coordinates (e.g. Delhi / IIIT)", () => {
    const delhiSeedIncident = { lat: 28.5464, lng: 77.2741 };
    const delhiHostelIncident = { lat: 28.5444, lng: 77.2735 };
    const delhiMarketIncident = { lat: 28.5456, lng: 77.2717 };
    const bangalorePoint = { lat: 12.9716, lng: 77.5946 };

    expect(isWithinBhopal(delhiSeedIncident)).toBe(false);
    expect(isWithinBhopal(delhiHostelIncident)).toBe(false);
    expect(isWithinBhopal(delhiMarketIncident)).toBe(false);
    expect(isWithinBhopal(bangalorePoint)).toBe(false);
  });

  it("sanitizes legacy coordinates into Bhopal metro zone while preserving metadata", () => {
    const legacyDelhiPoint = {
      lat: 28.5464,
      lng: 77.2741,
      source: "gps" as const,
      accuracyMeters: 10,
    };

    const sanitized = sanitizeToBhopal(legacyDelhiPoint, 0);

    expect(isWithinBhopal(sanitized)).toBe(true);
    expect(sanitized.lat).toBeGreaterThanOrEqual(BHOPAL_METRO_BOUNDS.minLat);
    expect(sanitized.lat).toBeLessThanOrEqual(BHOPAL_METRO_BOUNDS.maxLat);
    expect(sanitized.lng).toBeGreaterThanOrEqual(BHOPAL_METRO_BOUNDS.minLng);
    expect(sanitized.lng).toBeLessThanOrEqual(BHOPAL_METRO_BOUNDS.maxLng);
    expect(sanitized.source).toBe("gps");
    expect(sanitized.accuracyMeters).toBe(10);
  });

  it("leaves coordinates already within Bhopal untouched", () => {
    const realBhopalPoint = {
      lat: 23.2332,
      lng: 77.4343,
      source: "gps" as const,
    };

    const sanitized = sanitizeToBhopal(realBhopalPoint);
    expect(sanitized.lat).toBe(23.2332);
    expect(sanitized.lng).toBe(77.4343);
    expect(sanitized.source).toBe("gps");
  });

  it("computes viewport bounding box strictly enclosing Bhopal and discarding Delhi", () => {
    const mixedPoints = [
      { lat: 23.2599, lng: 77.4126 }, // Bhopal Station
      { lat: 23.2082, lng: 77.461 }, // Bhopal AIIMS
      { lat: 28.5464, lng: 77.2741 }, // Legacy Delhi point (MUST BE FILTERED)
    ];

    const bounds = computeGeoBounds(mixedPoints);
    expect(bounds).not.toBeNull();
    if (bounds) {
      const [[south, west], [north, east]] = bounds;
      // All corners must be inside Bhopal metro area
      expect(south).toBeGreaterThanOrEqual(BHOPAL_METRO_BOUNDS.minLat);
      expect(north).toBeLessThanOrEqual(BHOPAL_METRO_BOUNDS.maxLat);
      expect(west).toBeGreaterThanOrEqual(BHOPAL_METRO_BOUNDS.minLng);
      expect(east).toBeLessThanOrEqual(BHOPAL_METRO_BOUNDS.maxLng);

      // Verify Delhi (lat ~28.5) is NOT in the bounds
      expect(north).toBeLessThan(25.0);
    }
  });
});
