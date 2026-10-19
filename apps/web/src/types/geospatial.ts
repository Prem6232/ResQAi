export interface CampusBounds {
  name: string;
  polygon: [number, number][];
  srid: 4326;
}

export interface RoutePath {
  coordinates: [number, number][];
  durationMinutes: number;
  distanceKm: number;
  source: "osrm_baseline" | "campus_graph" | "demo_adapter";
  liveTraffic: false;
  guaranteedSafe: false;
}

export interface DensityCell {
  lat: number;
  lng: number;
  weight: number;
}
