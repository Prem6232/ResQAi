import { describe, expect, it } from "vitest";
import {
  polygonLatLngToLngLat,
  polygonLngLatToLatLng,
  syntheticCampusPolygon,
} from "./mapConstants";

describe("mapConstants", () => {
  it("converts Leaflet [lat, lng] vertices to GeoJSON [lng, lat] and back cleanly", () => {
    const geoJsonCoords = polygonLatLngToLngLat(syntheticCampusPolygon);
    expect(geoJsonCoords).toHaveLength(4);
    expect(geoJsonCoords[0][0]).toBeCloseTo(syntheticCampusPolygon[0][1], 5);
    expect(geoJsonCoords[0][1]).toBeCloseTo(syntheticCampusPolygon[0][0], 5);

    const roundTrip = polygonLngLatToLatLng(geoJsonCoords);
    expect(roundTrip).toHaveLength(4);
    expect(roundTrip[0][0]).toBeCloseTo(syntheticCampusPolygon[0][0], 5);
    expect(roundTrip[0][1]).toBeCloseTo(syntheticCampusPolygon[0][1], 5);
  });
});
