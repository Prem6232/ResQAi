import { MobileHeader } from "@/components/common/Header";
import { CampusBaseMap } from "@/components/maps/CampusBaseMap";
import { CircleMarker, Popup } from "react-leaflet";
import { api } from "@/lib/api";
import { useState, useEffect, useCallback } from "react";
import type { NearbyAlert } from "@/types/responder";
import { StatusIndicator } from "@/components/common/StatusIndicator";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { routes } from "@/config/routes.config";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useLiveEvents } from "@/hooks/useLiveEvents";

export function CitizenAlertsPage() {
  const geo = useGeolocation();
  const { events } = useLiveEvents();
  const [alerts, setAlerts] = useState<NearbyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    setError(null);
    try {
      const list = await api.alerts(geo.point.lat, geo.point.lng);
      setAlerts(list);
    } catch {
      setError("Could not load nearby safety notices.");
    } finally {
      setLoading(false);
    }
  }, [geo.point.lat, geo.point.lng]);

  useEffect(() => {
    void geo.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  useEffect(() => {
    if (events.length === 0) return;
    const latest = events[0];
    if (
      latest.type === "report.received" ||
      latest.type === "report.cancelled" ||
      latest.type === "incident.updated"
    ) {
      void loadAlerts();
    }
  }, [events, loadAlerts]);

  return (
    <div>
      <MobileHeader role="Citizen" />
      <h1 className="mb-1 font-display text-2xl font-extrabold">Nearby alerts</h1>
      <p className="mb-3 text-xs text-ink-700/50">
        Coarsened operational notices. Personal-safety locations are never shown precisely on this map.
      </p>
      <CampusBaseMap height={180} center={[geo.point.lat, geo.point.lng]}>
        {alerts
          .filter((a) => a.location && typeof a.location.lat === "number" && typeof a.location.lng === "number")
          .map((a) => (
            <CircleMarker
              key={a.id}
              center={[a.location!.lat, a.location!.lng]}
              radius={a.tone === "active" ? 26 : 18}
              pathOptions={{ color: a.tone === "active" ? "#E23B3B" : "#D97706", fillOpacity: 0.22 }}
            >
              <Popup>
                <p className="font-semibold">{a.title}</p>
                <p className="text-xs">{a.distanceLabel} · coarsened</p>
              </Popup>
            </CircleMarker>
          ))}
      </CampusBaseMap>
      <div className="mt-4 space-y-3">
        {error ? <p className="text-xs text-sos-600">{error}</p> : null}
        {loading ? (
          <p className="text-sm text-ink-700/50">Loading nearby notices…</p>
        ) : alerts.length > 0 ? (
          alerts.map((a) => (
            <div key={a.id} className="rounded-3xl bg-white p-4 shadow-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{a.title}</p>
                  <p className="text-xs text-ink-700/50">{a.statusLabel}</p>
                </div>
                <StatusIndicator
                  label={a.tone === "active" ? "Active" : "Caution"}
                  tone={a.tone === "active" ? "danger" : "warn"}
                />
              </div>
              <p className="mt-2 text-xs text-ink-700/50">{a.distanceLabel} · coarsened</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-ink-700/50">No active broadcast notices in your proximity.</p>
        )}
      </div>
      <Button asChild className="mt-6 w-full" variant="dark">
        <Link to={routes.citizen.newReport}>Report new incident</Link>
      </Button>
    </div>
  );
}
