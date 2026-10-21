import { MobileHeader } from "@/components/common/Header";
import { CampusBaseMap } from "@/components/maps/CampusBaseMap";
import { CircleMarker } from "react-leaflet";
import { mapConfig } from "@/config/map.config";
import { mockApi } from "@/lib/mock-api";
import { useState, useEffect } from "react";
import type { NearbyAlert } from "@/types/responder";
import { StatusIndicator } from "@/components/common/StatusIndicator";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { routes } from "@/config/routes.config";

export function CitizenAlertsPage() {
  const [alerts, setAlerts] = useState<NearbyAlert[]>([]);

  useEffect(() => {
    mockApi.alerts().then(setAlerts);
  }, []);

  return (
    <div>
      <MobileHeader role="Citizen" />
      <h1 className="mb-1 font-display text-2xl font-extrabold">Nearby alerts</h1>
      <p className="mb-3 text-xs text-ink-700/50">
        Coarsened operational notices. Personal-safety locations are never shown precisely on this map.
      </p>
      <CampusBaseMap height={180}>
        <CircleMarker
          center={[mapConfig.campusCenter.lat + 0.001, mapConfig.campusCenter.lng + 0.0008]}
          radius={28}
          pathOptions={{ color: "#E23B3B", fillOpacity: 0.2 }}
        />
        <CircleMarker
          center={[mapConfig.campusCenter.lat - 0.0006, mapConfig.campusCenter.lng - 0.001]}
          radius={18}
          pathOptions={{ color: "#D97706", fillOpacity: 0.2 }}
        />
      </CampusBaseMap>
      <div className="mt-4 space-y-3">
        {alerts.length > 0 ? (
          alerts.map((a) => (
            <div key={a.id} className="rounded-3xl bg-white p-4 shadow-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{a.title}</p>
                  <p className="text-xs text-ink-700/50">{a.statusLabel}</p>
                </div>
                <StatusIndicator label={a.tone === "active" ? "Active" : "Caution"} tone={a.tone === "active" ? "danger" : "warn"} />
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
