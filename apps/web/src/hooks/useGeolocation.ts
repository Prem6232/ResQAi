import { useCallback, useState } from "react";
import type { GeoPoint } from "@/types/common";
import { mapConfig } from "@/config/map.config";

export function useGeolocation() {
  const [point, setPoint] = useState<GeoPoint>({
    lat: mapConfig.campusCenter.lat,
    lng: mapConfig.campusCenter.lng,
    source: "unknown",
  });
  const [error, setError] = useState<string>();
  const [consent, setConsent] = useState(false);

  const request = useCallback(() => {
    return new Promise<GeoPoint | null>((resolve) => {
      if (!navigator.geolocation) {
        setError("Geolocation is not available on this device.");
        resolve(null);
        return;
      }
      setConsent(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next: GeoPoint = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyMeters: pos.coords.accuracy,
            source: "gps",
          };
          setPoint(next);
          resolve(next);
        },
        () => {
          setError("Location permission denied. You can pick a point on the map.");
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
  }, []);

  return { point, setPoint, error, consent, request };
}
