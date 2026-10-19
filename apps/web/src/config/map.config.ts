export const mapConfig = {
  tileUrl:
    import.meta.env.VITE_MAP_TILE_URL ??
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution:
    import.meta.env.VITE_MAP_ATTRIBUTION ?? "© OpenStreetMap contributors",
  campusCenter: {
    lat: Number(import.meta.env.VITE_CAMPUS_LAT ?? 28.5452),
    lng: Number(import.meta.env.VITE_CAMPUS_LNG ?? 77.2731),
  },
  defaultZoom: 16,
  srid: 4326 as const,
};
