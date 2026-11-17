export const mapConfig = {
  tileUrl:
    import.meta.env.VITE_MAP_TILE_URL ??
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution:
    import.meta.env.VITE_MAP_ATTRIBUTION ?? "© OpenStreetMap contributors",
  campusCenter: {
    lat: Number(import.meta.env.VITE_CAMPUS_LAT ?? 23.2599),
    lng: Number(import.meta.env.VITE_CAMPUS_LNG ?? 77.4126),
  },
  defaultZoom: 13,
  srid: 4326 as const,
};
