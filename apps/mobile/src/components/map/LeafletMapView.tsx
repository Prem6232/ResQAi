import React, { useRef, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS } from "../../theme";
import { GeoPoint, IncidentCategory, IncidentUrgency } from "../../types";

export const BHOPAL_CENTER: GeoPoint = {
  lat: 23.2599,
  lng: 77.4126,
};

export const BHOPAL_BOUNDS = {
  minLat: 23.1600,
  maxLat: 23.3500,
  minLng: 77.3000,
  maxLng: 77.5300,
};

export interface MapIncidentMarker {
  id: string;
  title: string;
  category: IncidentCategory;
  urgency?: IncidentUrgency;
  lat: number;
  lng: number;
  locationLabel?: string;
  tone?: "active" | "caution" | "resolved";
  distanceLabel?: string;
}

export interface MapResponderMarker {
  id: string;
  unitCode: string;
  displayName: string;
  lat: number;
  lng: number;
  isOnDuty?: boolean;
  status?: string;
}

export interface LeafletMapViewProps {
  height?: number;
  selfPoint?: GeoPoint;
  incidents?: MapIncidentMarker[];
  responders?: MapResponderMarker[];
  targetIncident?: MapIncidentMarker | null;
  showRoute?: boolean;
  routeCoordinates?: Array<[number, number]>;
  etaMinutes?: number;
  distanceKm?: number;
  onSelectIncident?: (incident: MapIncidentMarker) => void;
  onSelectResponder?: (responder: MapResponderMarker) => void;
  onMapClick?: (coords: GeoPoint) => void;
  interactive?: boolean;
  mapStyle?: "standard" | "satellite" | "dark";
}

export const LeafletMapView: React.FC<LeafletMapViewProps> = ({
  height = 240,
  selfPoint = BHOPAL_CENTER,
  incidents = [],
  responders = [],
  targetIncident = null,
  showRoute = false,
  routeCoordinates,
  etaMinutes,
  distanceKm,
  onSelectIncident,
  onSelectResponder,
  onMapClick,
  interactive = true,
}) => {
  const webViewRef = useRef<any>(null);
  const WebViewComponent = WebView as any;

  // Fallback landmarks in Bhopal if no incidents are active
  const bhopalLandmarks = useMemo(
    () => [
      { name: "Upper Lake (Bada Talab)", lat: 23.245, lng: 77.375, type: "water" },
      { name: "MP Nagar Zone-1 Hub", lat: 23.2332, lng: 77.4343, type: "commercial" },
      { name: "Bhopal Junction Railway", lat: 23.2678, lng: 77.4131, type: "transit" },
      { name: "AIIMS Bhopal", lat: 23.2082, lng: 77.461, type: "medical" },
      { name: "MANIT Bhopal Campus", lat: 23.2167, lng: 77.4083, type: "academic" },
    ],
    []
  );

  // Generate Leaflet HTML payload
  const htmlContent = useMemo(() => {
    const serializedSelf = JSON.stringify(selfPoint || BHOPAL_CENTER);
    const serializedIncidents = JSON.stringify(incidents);
    const serializedResponders = JSON.stringify(responders);
    const serializedTarget = JSON.stringify(targetIncident);
    const serializedLandmarks = JSON.stringify(bhopalLandmarks);
    const serializedRouteCoords = JSON.stringify(routeCoordinates || null);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Bhopal Leaflet Grid</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map {
      width: 100%; height: 100%;
      background: #0f172a;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .leaflet-container {
      width: 100% !important;
      height: 100% !important;
      background: #0f172a !important;
    }

    /* Bhopal City Tag */
    .bhopal-badge {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 1000;
      background: rgba(15, 23, 42, 0.88);
      backdrop-filter: blur(6px);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 16px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 700;
      color: #38bdf8;
      display: flex;
      align-items: center;
      gap: 6px;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .bhopal-badge-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
    }

    /* Self User Marker */
    .self-marker {
      position: relative;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .self-pulse {
      position: absolute;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(37, 99, 235, 0.35);
      border: 1.5px solid #3b82f6;
      animation: radar-pulse 2s infinite ease-out;
    }
    .self-core {
      position: relative;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #2563eb;
      border: 2.5px solid #ffffff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.5);
    }
    @keyframes radar-pulse {
      0% { transform: scale(0.6); opacity: 0.9; }
      100% { transform: scale(2.2); opacity: 0; }
    }

    /* Incident Markers */
    .inc-pin {
      position: relative;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid #ffffff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.45);
      cursor: pointer;
      color: #ffffff;
      font-weight: bold;
    }
    .inc-pin.critical { background: #e11d48; }
    .inc-pin.hazard { background: #d97706; }
    .inc-pin.caution { background: #f59e0b; }
    .inc-pin.medical { background: #0284c7; }
    .inc-pin.fire { background: #dc2626; }
    .inc-pin.resolved { background: #10b981; }

    .inc-pulse {
      position: absolute;
      top: -6px; left: -6px; right: -6px; bottom: -6px;
      border-radius: 50%;
      background: rgba(225, 29, 72, 0.4);
      animation: alert-ring 1.8s infinite;
      z-index: -1;
    }
    @keyframes alert-ring {
      0% { transform: scale(0.8); opacity: 1; }
      100% { transform: scale(1.8); opacity: 0; }
    }

    /* Responder Marker */
    .resp-badge {
      background: #059669;
      color: #ffffff;
      border: 2px solid #d1fae5;
      border-radius: 14px;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 800;
      box-shadow: 0 3px 8px rgba(0,0,0,0.35);
      display: flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }

    /* Landmark Marker */
    .landmark-pin {
      background: rgba(30, 41, 59, 0.85);
      border: 1px solid #64748b;
      border-radius: 12px;
      padding: 2px 6px;
      font-size: 10px;
      color: #cbd5e1;
      white-space: nowrap;
      pointer-events: none;
    }

    /* Leaflet Popups */
    .leaflet-popup-content-wrapper {
      background: #1e293b !important;
      color: #f8fafc !important;
      border-radius: 10px !important;
      border: 1px solid #334155 !important;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5) !important;
      padding: 2px !important;
    }
    .leaflet-popup-content {
      margin: 10px 12px !important;
      font-size: 12px !important;
    }
    .leaflet-popup-tip {
      background: #1e293b !important;
    }
    .popup-title {
      font-weight: 700;
      font-size: 13px;
      color: #f8fafc;
      margin-bottom: 4px;
    }
    .popup-badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .popup-badge.active { background: rgba(225,29,72,0.25); color: #f43f5e; border: 1px solid #e11d48; }
    .popup-badge.caution { background: rgba(217,119,6,0.25); color: #fbbf24; border: 1px solid #d97706; }
    .popup-badge.resolved { background: rgba(16,185,129,0.25); color: #34d399; border: 1px solid #10b981; }
    .popup-meta {
      font-size: 11px;
      color: #94a3b8;
      margin-bottom: 8px;
    }
    .popup-btn {
      display: block;
      width: 100%;
      text-align: center;
      background: #2563eb;
      color: #ffffff;
      padding: 6px 10px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 11px;
      border: none;
      cursor: pointer;
    }

    /* Recenter Button */
    .recenter-btn {
      position: absolute;
      bottom: 12px;
      right: 12px;
      z-index: 1000;
      background: #1e293b;
      color: #f8fafc;
      border: 1px solid #475569;
      border-radius: 8px;
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="bhopal-badge">
    <div class="bhopal-badge-dot"></div>
    <span>Bhopal City · OpenStreetMap</span>
  </div>
  <button class="recenter-btn" onclick="recenterBhopal()" title="Recenter Bhopal">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="7"></circle>
      <line x1="12" y1="1" x2="12" y2="5"></line>
      <line x1="12" y1="19" x2="12" y2="23"></line>
      <line x1="1" y1="12" x2="5" y2="12"></line>
      <line x1="19" y1="12" x2="23" y2="12"></line>
    </svg>
  </button>

  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var BHOPAL = [23.2599, 77.4126];
    var selfData = ${serializedSelf};
    var incidentsData = ${serializedIncidents};
    var respondersData = ${serializedResponders};
    var targetData = ${serializedTarget};
    var landmarksData = ${serializedLandmarks};
    var routePoints = ${serializedRouteCoords};
    var showNavRoute = ${showRoute ? "true" : "false"};

    var initialCenter = [selfData.lat || BHOPAL[0], selfData.lng || BHOPAL[1]];
    if (targetData && targetData.lat && targetData.lng) {
      initialCenter = [(initialCenter[0] + targetData.lat) / 2, (initialCenter[1] + targetData.lng) / 2];
    }

    var map = L.map('map', {
      center: initialCenter,
      zoom: ${targetIncident ? 14 : 13},
      minZoom: 11,
      maxZoom: 18,
      zoomControl: ${interactive ? "true" : "false"},
      attributionControl: false
    });

    // Real OpenStreetMap Tile Layer
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: ['a', 'b', 'c']
    }).addTo(map);

    // Bhopal Metropolitan Geofence Boundary Polygon
    var bhopalBoundary = [
      [23.3300, 77.3100],
      [23.3300, 77.5100],
      [23.1700, 77.5100],
      [23.1700, 77.3100]
    ];
    L.polygon(bhopalBoundary, {
      color: '#0284c7',
      weight: 1.5,
      dashArray: '4, 4',
      fillColor: '#0284c7',
      fillOpacity: 0.04
    }).addTo(map);

    // Function to notify React Native
    function sendToNative(data) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      }
    }

    // Recenter Handler
    window.recenterBhopal = function() {
      map.flyTo(BHOPAL, 13, { duration: 0.8 });
    };

    // User / Self Location Marker
    var selfIcon = L.divIcon({
      className: 'self-marker-wrapper',
      html: '<div class="self-marker"><div class="self-pulse"></div><div class="self-core"></div></div>',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    L.marker([selfData.lat || BHOPAL[0], selfData.lng || BHOPAL[1]], { icon: selfIcon })
      .addTo(map)
      .bindPopup('<div class="popup-title">Current Location</div><div class="popup-meta">Bhopal Tactical Grid · GPS Active</div>');

    // Incident Category Icons & Markers
    function getCategoryIcon(cat) {
      switch(cat) {
        case 'fire_smoke': return '🔥';
        case 'road_accident': return '🚗';
        case 'water_flood': return '🌊';
        case 'medical': return '➕';
        case 'personal_sos': return '🚨';
        default: return '⚠️';
      }
    }

    // Add Incident Markers
    incidentsData.forEach(function(inc) {
      if (!inc.lat || !inc.lng) return;
      var isCritical = inc.urgency === 'critical' || inc.category === 'personal_sos';
      var catClass = inc.category === 'fire_smoke' ? 'fire' : inc.category === 'medical' ? 'medical' : inc.urgency === 'critical' ? 'critical' : 'hazard';
      
      var pulseHtml = isCritical ? '<div class="inc-pulse"></div>' : '';
      var pinHtml = '<div class="inc-pin ' + catClass + '">' + pulseHtml + getCategoryIcon(inc.category) + '</div>';

      var incIcon = L.divIcon({
        className: 'inc-marker-wrapper',
        html: pinHtml,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });

      var marker = L.marker([inc.lat, inc.lng], { icon: incIcon }).addTo(map);

      var popupHtml = '<div class="popup-title">' + (inc.title || 'Incident') + '</div>' +
        '<span class="popup-badge ' + (isCritical ? 'active' : 'caution') + '">' + (inc.category || 'Incident').replace('_', ' ') + '</span>' +
        '<div class="popup-meta">📍 ' + (inc.locationLabel || 'Bhopal City') + '<br/>📏 ' + (inc.distanceLabel || 'Near you') + '</div>' +
        '<button class="popup-btn" onclick="sendToNative({ type: \\'select_incident\\', id: \\'' + inc.id + '\\' })">Select Incident</button>';

      marker.bindPopup(popupHtml);
      marker.on('click', function() {
        sendToNative({ type: 'marker_click', id: inc.id });
      });
    });

    // Add Responder Markers
    respondersData.forEach(function(resp) {
      if (!resp.lat || !resp.lng) return;
      var respIcon = L.divIcon({
        className: 'resp-marker-wrapper',
        html: '<div class="resp-badge">🛡️ ' + (resp.unitCode || 'UNIT') + '</div>',
        iconSize: [70, 24],
        iconAnchor: [35, 12]
      });

      var rMarker = L.marker([resp.lat, resp.lng], { icon: respIcon }).addTo(map);
      rMarker.bindPopup('<div class="popup-title">' + (resp.displayName || resp.unitCode) + '</div><div class="popup-meta">Status: ' + (resp.isOnDuty ? 'On Duty · Telemetry Live' : 'Off Duty') + '</div>');
    });

    // If no incidents, show key Bhopal city landmark badges
    if (incidentsData.length === 0) {
      landmarksData.forEach(function(lm) {
        var lmIcon = L.divIcon({
          className: 'lm-marker-wrapper',
          html: '<div class="landmark-pin">📍 ' + lm.name + '</div>',
          iconSize: [120, 20],
          iconAnchor: [60, 10]
        });
        L.marker([lm.lat, lm.lng], { icon: lmIcon }).addTo(map);
      });
    }

    // Draw Live Route Polyline when navigating
    if ((showNavRoute || targetData) && targetData && targetData.lat && targetData.lng) {
      var startLat = selfData.lat || BHOPAL[0];
      var startLng = selfData.lng || BHOPAL[1];
      var endLat = targetData.lat;
      var endLng = targetData.lng;

      // Realistic path with midpoint waypoint in Bhopal
      var waypoints = [
        [startLat, startLng],
        [startLat + (endLat - startLat) * 0.45 + 0.0012, startLng + (endLng - startLng) * 0.45 - 0.001],
        [startLat + (endLat - startLat) * 0.75 - 0.0008, startLng + (endLng - startLng) * 0.75 + 0.0012],
        [endLat, endLng]
      ];

      if (routePoints && routePoints.length > 1) {
        waypoints = routePoints;
      }

      // Outer glow polyline
      L.polyline(waypoints, {
        color: '#2563eb',
        weight: 6,
        opacity: 0.45,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      // Inner sharp nav route line
      L.polyline(waypoints, {
        color: '#60a5fa',
        weight: 3.5,
        opacity: 0.95,
        dashArray: '6, 6',
        lineCap: 'round'
      }).addTo(map);

      // Fit route bounds smoothly
      var group = new L.featureGroup([
        L.marker([startLat, startLng]),
        L.marker([endLat, endLng])
      ]);
      map.fitBounds(group.getBounds().pad(0.3));
    }

    // Map Click Listener
    map.on('click', function(e) {
      sendToNative({
        type: 'map_click',
        lat: e.latlng.lat,
        lng: e.latlng.lng
      });
    });

    // Notify ready
    sendToNative({ type: 'ready' });
  </script>
</body>
</html>`;
  }, [selfPoint, incidents, responders, targetIncident, showRoute, routeCoordinates, bhopalLandmarks, interactive]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "select_incident" || data.type === "marker_click") {
        const found = incidents.find((i) => i.id === data.id);
        if (found && onSelectIncident) {
          onSelectIncident(found);
        }
      } else if (data.type === "select_responder") {
        const found = responders.find((r) => r.id === data.id);
        if (found && onSelectResponder) {
          onSelectResponder(found);
        }
      } else if (data.type === "map_click") {
        if (onMapClick) {
          onMapClick({ lat: data.lat, lng: data.lng });
        }
      }
    } catch (e) {
      console.warn("Error parsing Leaflet WebView message", e);
    }
  };

  return (
    <View style={[styles.container, { height }]}>
      <WebViewComponent
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ html: htmlContent }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scrollEnabled={false}
        scalesPageToFit={false}
        onMessage={handleMessage}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={COLORS.brandBlue} />
            <Text style={styles.loadingText}>Loading Bhopal City Leaflet Grid...</Text>
          </View>
        )}
        startInLoadingState={true}
      />

      {/* Floating Tactical Stats Overlay */}
      <View style={styles.headerOverlay} pointerEvents="box-none">
        <View style={styles.zonePill}>
          <View style={styles.zoneDot} />
          <Text style={styles.zoneText}>Bhopal Zone (23.2599°N, 77.4126°E)</Text>
        </View>

        {showRoute && (
          <View style={styles.routePill}>
            <Feather name="navigation" size={11} color="#2563EB" />
            <Text style={styles.routeText}>
              {distanceKm ? `${distanceKm.toFixed(1)} km` : "Routing Active"}
              {etaMinutes ? ` · ${etaMinutes}m` : ""}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#0F172A",
    position: "relative",
  },
  webview: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  loadingContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#0F172A",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "500",
  },
  headerOverlay: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  zonePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  zoneDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  zoneText: {
    color: "#E2E8F0",
    fontSize: 10,
    fontWeight: "600",
  },
  routePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  routeText: {
    color: "#1E293B",
    fontSize: 11,
    fontWeight: "700",
  },
});
