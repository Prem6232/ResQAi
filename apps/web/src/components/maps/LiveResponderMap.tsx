import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Compass, Crosshair, Radio, RefreshCw } from "lucide-react";
import { mapConfig } from "@/config/map.config";
import { mockApi } from "@/lib/mock-api";
import { useLiveEvents } from "@/hooks/useLiveEvents";
import { sendLocationPing } from "@/features/responder/api/sendLocationPing";
import type { GeoPoint } from "@/types/common";
import type { Incident } from "@/types/incident";
import type { AssignmentIncidentSummary } from "@/types/assignment";
import type { ResponderAvailability, ResponderProfile } from "@/types/responder";
import type { RoutePath } from "@/types/geospatial";
import { Button } from "@/components/ui/button";
import { IncidentMarker } from "./IncidentMarker";
import { PerimeterPolygon } from "./PerimeterPolygon";
import { ResponderMarker } from "./ResponderMarker";
import { RoutePolyline } from "./RoutePolyline";
import {
  applyWsResponderLocation,
  buildStraightLineRoute,
  computeGeoBounds,
  formatCoordinates,
  getResponderStatusTheme,
  haversineDistanceKm,
  isResponderTrackable,
} from "./liveResponderMapUtils";

type StatusFilter = "all" | "available" | "busy";

export interface LiveResponderMapProps {
  mode: "control_room" | "responder";
  height?: number;
  responders?: ResponderProfile[];
  incidents?: Incident[];
  selectedResponderId?: string;
  onSelectResponder?: (responder: ResponderProfile) => void;
  selectedIncidentId?: string;
  onSelectIncident?: (incident: Incident) => void;
  onRespondersUpdated?: (responders: ResponderProfile[]) => void;
  selfPoint?: GeoPoint;
  selfLabel?: string;
  targetIncident?: Incident | AssignmentIncidentSummary | null;
  etaMinutes?: number;
  distanceKm?: number;
  pollIntervalMs?: number;
  enableAutoPing?: boolean;
  onLocationSynced?: (point: GeoPoint) => void;
  showPerimeter?: boolean;
}

function MapViewportSync({
  focusPoint,
  boundsPoints,
  fitTrigger,
}: {
  focusPoint?: { lat: number; lng: number } | null;
  boundsPoints: Array<{ lat: number; lng: number }>;
  fitTrigger: number;
}) {
  const map = useMap();
  const initialFitDone = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    if (!focusPoint) return;
    map.flyTo([focusPoint.lat, focusPoint.lng], 17, { duration: 0.6 });
  }, [focusPoint, map]);

  useEffect(() => {
    if (fitTrigger === 0 && initialFitDone.current) return;
    const bounds = computeGeoBounds(boundsPoints);
    if (bounds) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 17 });
      initialFitDone.current = true;
    } else if (boundsPoints.length === 1 && fitTrigger > 0) {
      map.flyTo([boundsPoints[0].lat, boundsPoints[0].lng], 16, { duration: 0.5 });
    }
  }, [boundsPoints, fitTrigger, map]);

  return null;
}

export function LiveResponderMap({
  mode,
  height,
  responders: externalResponders,
  incidents = [],
  selectedResponderId,
  onSelectResponder,
  selectedIncidentId,
  onSelectIncident,
  onRespondersUpdated,
  selfPoint,
  selfLabel = "Your live unit",
  targetIncident = null,
  etaMinutes,
  distanceKm,
  pollIntervalMs = 5000,
  enableAutoPing = false,
  onLocationSynced,
  showPerimeter = true,
}: LiveResponderMapProps) {
  const { events, connected } = useLiveEvents();
  const [internalResponders, setInternalResponders] = useState<ResponderProfile[]>(
    externalResponders ?? []
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [focusId, setFocusId] = useState<string | undefined>(selectedResponderId);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const [liveSelfPoint, setLiveSelfPoint] = useState<GeoPoint>(
    selfPoint ?? {
      lat: mapConfig.campusCenter.lat,
      lng: mapConfig.campusCenter.lng,
      source: "unknown",
    }
  );
  const [gpsWarning, setGpsWarning] = useState<string | null>(null);
  const [autoPing, setAutoPing] = useState(enableAutoPing);
  const lastEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (externalResponders) {
      setInternalResponders(externalResponders);
    }
  }, [externalResponders]);

  useEffect(() => {
    setFocusId(selectedResponderId);
  }, [selectedResponderId]);

  useEffect(() => {
    if (selfPoint && selfPoint.source === "gps") {
      setLiveSelfPoint(selfPoint);
    }
  }, [selfPoint]);

  const fetchControlRoomRoster = useCallback(async () => {
    if (mode !== "control_room") return;
    setSyncing(true);
    try {
      const fresh = await mockApi.responders();
      setInternalResponders(fresh);
      onRespondersUpdated?.(fresh);
      setLastUpdatedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } finally {
      setSyncing(false);
    }
  }, [mode, onRespondersUpdated]);

  // Initial fetch (if control room did not pass responders) + polling interval
  useEffect(() => {
    if (mode !== "control_room") return;
    if (!externalResponders) {
      void fetchControlRoomRoster();
    } else if (!lastUpdatedAt) {
      setLastUpdatedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }

    const timer = window.setInterval(() => {
      void fetchControlRoomRoster();
    }, pollIntervalMs);

    return () => window.clearInterval(timer);
  }, [mode, externalResponders, fetchControlRoomRoster, pollIntervalMs, lastUpdatedAt]);

  // Apply real-time WebSocket responder telemetry / assignment events
  useEffect(() => {
    if (events.length === 0) return;
    const latest = events[0];
    if (latest.id === lastEventIdRef.current) return;
    lastEventIdRef.current = latest.id;

    if (mode === "control_room") {
      setInternalResponders((prev) => {
        const updated = applyWsResponderLocation(prev, latest);
        if (updated !== prev) {
          onRespondersUpdated?.(updated);
          setLastUpdatedAt(
            new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
          );
        }
        return updated;
      });
      if (latest.type === "assignment.updated" || latest.type === "assignment.offered") {
        void fetchControlRoomRoster();
      }
    }
  }, [events, mode, fetchControlRoomRoster, onRespondersUpdated]);

  // Watch browser geolocation in responder mode
  useEffect(() => {
    if (mode !== "responder" || typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsWarning(null);
        setLiveSelfPoint({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy,
          source: "gps",
        });
      },
      () => {
        setGpsWarning("GPS signal unavailable — using last known campus coordinates.");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 8000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [mode]);

  const sendManualPing = useCallback(async () => {
    if (mode !== "responder") return;
    setSyncing(true);
    try {
      await sendLocationPing(liveSelfPoint);
      setLastUpdatedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      onLocationSynced?.(liveSelfPoint);
    } catch {
      setGpsWarning("Could not sync location ping to dispatch server.");
    } finally {
      setSyncing(false);
    }
  }, [mode, liveSelfPoint, onLocationSynced]);

  // Optional 15s automatic GPS ping streaming in responder mode
  useEffect(() => {
    if (mode !== "responder" || !autoPing) return;
    void sendManualPing();
    const timer = window.setInterval(() => {
      void sendManualPing();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [mode, autoPing, sendManualPing]);

  const filteredResponders = useMemo(() => {
    if (statusFilter === "all") return internalResponders;
    return internalResponders.filter((r) => r.status === statusFilter);
  }, [internalResponders, statusFilter]);

  const trackableResponders = useMemo(
    () => filteredResponders.filter(isResponderTrackable),
    [filteredResponders]
  );

  const selectedResponder = useMemo(
    () => internalResponders.find((r) => r.id === focusId),
    [internalResponders, focusId]
  );

  const focusPoint = useMemo(() => {
    if (mode === "control_room") {
      return selectedResponder?.lastLocation
        ? { lat: selectedResponder.lastLocation.lat, lng: selectedResponder.lastLocation.lng }
        : null;
    }
    return null;
  }, [mode, selectedResponder]);

  const boundsPoints = useMemo(() => {
    if (mode === "control_room") {
      const pts: Array<{ lat: number; lng: number }> = [];
      for (const r of trackableResponders) {
        if (r.lastLocation) pts.push({ lat: r.lastLocation.lat, lng: r.lastLocation.lng });
      }
      for (const inc of incidents) {
        pts.push({ lat: inc.location.lat, lng: inc.location.lng });
      }
      return pts;
    }
    const pts: Array<{ lat: number; lng: number }> = [
      { lat: liveSelfPoint.lat, lng: liveSelfPoint.lng },
    ];
    if (targetIncident?.location) {
      pts.push({ lat: targetIncident.location.lat, lng: targetIncident.location.lng });
    }
    return pts;
  }, [mode, trackableResponders, incidents, liveSelfPoint, targetIncident]);

  const [osrmRoute, setOsrmRoute] = useState<RoutePath | null>(null);
  const snappedLat = Math.round(liveSelfPoint.lat * 5000) / 5000;
  const snappedLng = Math.round(liveSelfPoint.lng * 5000) / 5000;
  const targetLat = targetIncident?.location?.lat;
  const targetLng = targetIncident?.location?.lng;

  useEffect(() => {
    if (mode !== "responder" || typeof targetLat !== "number" || typeof targetLng !== "number") {
      setOsrmRoute(null);
      return;
    }
    let active = true;
    mockApi
      .fetchRoute({ lat: snappedLat, lng: snappedLng }, { lat: targetLat, lng: targetLng }, "foot")
      .then((route) => {
        if (active) setOsrmRoute(route);
      });
    return () => {
      active = false;
    };
  }, [mode, snappedLat, snappedLng, targetLat, targetLng]);

  const responderRoute: RoutePath | null = useMemo(() => {
    if (mode !== "responder" || !targetIncident?.location) return null;
    if (osrmRoute) return osrmRoute;
    return buildStraightLineRoute(liveSelfPoint, targetIncident.location, etaMinutes, distanceKm);
  }, [mode, targetIncident, osrmRoute, liveSelfPoint, etaMinutes, distanceKm]);

  const resolvedHeight = height ?? (mode === "control_room" ? 480 : 280);
  const initialCenter: [number, number] =
    mode === "responder" && targetIncident?.location
      ? [targetIncident.location.lat, targetIncident.location.lng]
      : mode === "responder"
        ? [liveSelfPoint.lat, liveSelfPoint.lng]
        : [mapConfig.campusCenter.lat, mapConfig.campusCenter.lng];

  return (
    <div className="space-y-2.5 rounded-3xl bg-white p-3 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-duty-50 px-2.5 py-1 text-[11px] font-semibold text-duty-600">
            <Radio className={`h-3 w-3 ${connected ? "animate-pulse" : ""}`} />
            {mode === "control_room"
              ? `Live fleet · ${trackableResponders.length}/${internalResponders.length} tracked`
              : "Live GPS telemetry"}
          </span>
          {lastUpdatedAt ? (
            <span className="text-[11px] text-ink-700/50">Updated {lastUpdatedAt}</span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {mode === "control_room" ? (
            <>
              {(["all", "available", "busy"] as StatusFilter[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition ${
                    statusFilter === key
                      ? "bg-ink-900 text-white"
                      : "bg-paper-100 text-ink-700 hover:bg-paper-200"
                  }`}
                >
                  {key}
                </button>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 rounded-full px-2.5 text-[11px]"
                onClick={() => {
                  setFocusId(undefined);
                  setFitTrigger((n) => n + 1);
                }}
              >
                <Compass className="mr-1 h-3 w-3" />
                Fit view
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 rounded-full px-2.5 text-[11px]"
                disabled={syncing}
                onClick={() => void fetchControlRoomRoster()}
              >
                <RefreshCw className={`mr-1 h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
                Sync
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant={autoPing ? "duty" : "outline"}
                className="h-7 rounded-full px-2.5 text-[11px]"
                onClick={() => setAutoPing((prev) => !prev)}
              >
                {autoPing ? "Auto-ping ON" : "Auto-ping 15s"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 rounded-full px-2.5 text-[11px]"
                disabled={syncing}
                onClick={() => void sendManualPing()}
              >
                <Crosshair className="mr-1 h-3 w-3" />
                {syncing ? "Syncing…" : "Ping GPS"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 rounded-full px-2.5 text-[11px]"
                onClick={() => setFitTrigger((n) => n + 1)}
              >
                <Compass className="mr-1 h-3 w-3" />
                Re-center
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-black/5" style={{ height: resolvedHeight }}>
        <MapContainer
          center={initialCenter}
          zoom={mode === "control_room" ? 15 : mapConfig.defaultZoom}
          className="h-full w-full"
          scrollWheelZoom={false}
          attributionControl
        >
          <TileLayer url={mapConfig.tileUrl} attribution={mapConfig.attribution} />
          <MapViewportSync
            focusPoint={focusPoint}
            boundsPoints={boundsPoints}
            fitTrigger={fitTrigger}
          />
          {showPerimeter ? <PerimeterPolygon /> : null}

          {mode === "control_room" ? (
            <>
              {incidents.map((inc) => (
                <IncidentMarker
                  key={inc.id}
                  incident={inc}
                  selected={selectedIncidentId === inc.id}
                  onSelect={onSelectIncident}
                />
              ))}
              {trackableResponders.map((resp) => (
                <ResponderMarker
                  key={resp.id}
                  responder={resp}
                  selected={focusId === resp.id}
                  onSelect={(selected) => {
                    setFocusId(selected.id);
                    onSelectResponder?.(selected);
                  }}
                />
              ))}
            </>
          ) : (
            <>
              {liveSelfPoint.accuracyMeters ? (
                <Circle
                  center={[liveSelfPoint.lat, liveSelfPoint.lng]}
                  radius={Math.min(120, Math.max(12, liveSelfPoint.accuracyMeters))}
                  pathOptions={{ color: "#1D4ED8", weight: 1, fillColor: "#3B82F6", fillOpacity: 0.12 }}
                />
              ) : null}
              <CircleMarker
                center={[liveSelfPoint.lat, liveSelfPoint.lng]}
                radius={14}
                pathOptions={{ color: "#1D4ED8", weight: 1.5, fillColor: "#3B82F6", fillOpacity: 0.18 }}
              />
              <CircleMarker
                center={[liveSelfPoint.lat, liveSelfPoint.lng]}
                radius={7}
                pathOptions={{ color: "#FFFFFF", weight: 2.5, fillColor: "#1D4ED8", fillOpacity: 1 }}
              >
                <Tooltip direction="top" offset={[0, -6]} permanent>
                  {selfLabel}
                </Tooltip>
                <Popup>
                  <div className="text-xs">
                    <p className="font-semibold">{selfLabel}</p>
                    <p className="text-ink-700/70">
                      {formatCoordinates(liveSelfPoint.lat, liveSelfPoint.lng)} ({liveSelfPoint.source})
                    </p>
                  </div>
                </Popup>
              </CircleMarker>

              {targetIncident?.location ? (
                <>
                  <CircleMarker
                    center={[targetIncident.location.lat, targetIncident.location.lng]}
                    radius={11}
                    pathOptions={{ color: "#C81E1E", weight: 2, fillColor: "#E23B3B", fillOpacity: 0.35 }}
                  >
                    <Tooltip direction="top" offset={[0, -6]}>
                      {targetIncident.title} · {targetIncident.locationLabel}
                    </Tooltip>
                    <Popup>
                      <div className="text-xs">
                        <p className="font-semibold">{targetIncident.title}</p>
                        <p className="text-ink-700/70">{targetIncident.locationLabel}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                  {responderRoute ? <RoutePolyline route={responderRoute} /> : null}
                </>
              ) : null}
            </>
          )}
        </MapContainer>
      </div>

      {mode === "control_room" && trackableResponders.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px]">
          <div className="flex flex-wrap items-center gap-1.5">
            {trackableResponders.map((r) => {
              const theme = getResponderStatusTheme(r.status);
              const isSelected = focusId === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setFocusId(r.id);
                    onSelectResponder?.(r);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium transition ${
                    isSelected
                      ? "border-command-500 bg-command-50 text-command-600"
                      : "border-black/5 bg-paper-50 text-ink-700 hover:bg-paper-100"
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: theme.fillColor }}
                  />
                  {r.unitCode}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3 text-ink-700/60">
            {(["available", "busy", "off_duty"] as ResponderAvailability[]).map((st) => {
              const t = getResponderStatusTheme(st);
              return (
                <span key={st} className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.fillColor }} />
                  {t.label}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      {mode === "responder" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-ink-700/65">
          <span>
            Coords: {formatCoordinates(liveSelfPoint.lat, liveSelfPoint.lng)}
            {responderRoute
              ? ` · ${responderRoute.source === "osrm_baseline" ? "OSRM path" : "Direct"} ${responderRoute.durationMinutes}m (${responderRoute.distanceKm} km)`
              : targetIncident?.location
                ? ` · Target ${distanceKm ?? haversineDistanceKm(liveSelfPoint, targetIncident.location)} km`
                : ""}
          </span>
          {gpsWarning ? <span className="text-amber-700">{gpsWarning}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
