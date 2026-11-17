import React, { useRef, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Platform,
} from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { Feather } from "@expo/vector-icons";
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
  allowFullscreen?: boolean;
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
  allowFullscreen = true,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const webViewRef = useRef<any>(null);
  const fullscreenWebViewRef = useRef<any>(null);
  const WebViewComponent = WebView as any;

  // Key Bhopal landmarks for authentic city rendering
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

  // Generate Leaflet HTML payload with full Google Maps-like pinch-to-zoom
  const getHtmlContent = (fullScreenMode: boolean) => {
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes" />
  <title>Bhopal Leaflet Grid</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map {
      width: 100%; height: 100%;
      background: #0f172a;
      overflow: hidden;
      touch-action: pan-x pan-y pinch-zoom;
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
      background: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(56, 189, 248, 0.4);
      border-radius: 16px;
      padding: 5px 12px;
      font-size: 11px;
      font-weight: 700;
      color: #38bdf8;
      display: flex;
      align-items: center;
      gap: 6px;
      pointer-events: none;
      box-shadow: 0 4px 14px rgba(0,0,0,0.4);
    }
    .bhopal-badge-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
    }

    /* Floating Zoom Controls */
    .zoom-controls {
      position: absolute;
      bottom: 24px;
      right: 16px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .zoom-btn {
      width: 42px;
      height: 42px;
      border-radius: 10px;
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.25);
      color: #ffffff;
      font-size: 22px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.45);
      user-select: none;
    }
    .zoom-btn:active {
      background: #2563eb;
    }

    /* Recenter Button */
    .recenter-btn {
      position: absolute;
      bottom: 122px;
      right: 16px;
      z-index: 1000;
      background: rgba(15, 23, 42, 0.92);
      color: #f8fafc;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 10px;
      width: 42px;
      height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.45);
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
      background: rgba(37, 99, 235, 0.4);
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
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid #ffffff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.45);
      cursor: pointer;
      color: #ffffff;
      font-size: 15px;
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
      background: rgba(225, 29, 72, 0.45);
      animation: alert-ring 1.8s infinite;
      z-index: -1;
    }
    @keyframes alert-ring {
      0% { transform: scale(0.8); opacity: 1; }
      100% { transform: scale(1.9); opacity: 0; }
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
      background: rgba(30, 41, 59, 0.9);
      border: 1px solid #64748b;
      border-radius: 12px;
      padding: 2px 7px;
      font-size: 10px;
      font-weight: 600;
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
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="bhopal-badge">
    <div class="bhopal-badge-dot"></div>
    <span>Bhopal City · Live OSM</span>
  </div>

  <div class="zoom-controls">
    <button class="zoom-btn" onclick="map.zoomIn()" title="Zoom In">+</button>
    <button class="zoom-btn" onclick="map.zoomOut()" title="Zoom Out">−</button>
  </div>

  <button class="recenter-btn" onclick="recenterBhopal()" title="Recenter Bhopal">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
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

    // Initialize Leaflet with touch zoom & pinch-to-zoom enabled
    var map = L.map('map', {
      center: initialCenter,
      zoom: ${targetIncident ? 14 : 13},
      minZoom: 10,
      maxZoom: 19,
      zoomControl: false,
      touchZoom: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      boxZoom: true,
      dragging: true,
      tap: false,
      bounceAtZoomLimits: false,
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

    // Notify React Native
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
        iconSize: [32, 32],
        iconAnchor: [16, 16]
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

    // If no incidents, show Bhopal landmarks
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

    // Draw Live Route Polyline
    if ((showNavRoute || targetData) && targetData && targetData.lat && targetData.lng) {
      var startLat = selfData.lat || BHOPAL[0];
      var startLng = selfData.lng || BHOPAL[1];
      var endLat = targetData.lat;
      var endLng = targetData.lng;

      var waypoints = [
        [startLat, startLng],
        [startLat + (endLat - startLat) * 0.45 + 0.0012, startLng + (endLng - startLng) * 0.45 - 0.001],
        [startLat + (endLat - startLat) * 0.75 - 0.0008, startLng + (endLng - startLng) * 0.75 + 0.0012],
        [endLat, endLng]
      ];

      if (routePoints && routePoints.length > 1) {
        waypoints = routePoints;
      }

      L.polyline(waypoints, {
        color: '#2563eb',
        weight: 6,
        opacity: 0.45,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      L.polyline(waypoints, {
        color: '#60a5fa',
        weight: 3.5,
        opacity: 0.95,
        dashArray: '6, 6',
        lineCap: 'round'
      }).addTo(map);

      var group = new L.featureGroup([
        L.marker([startLat, startLng]),
        L.marker([endLat, endLng])
      ]);
      map.fitBounds(group.getBounds().pad(0.3));
    }

    // Map Click Listener
    map.on('click', function(e) {
      sendToNative({
        type: 'map_tap',
        lat: e.latlng.lat,
        lng: e.latlng.lng
      });
    });

    sendToNative({ type: 'ready' });
  </script>
</body>
</html>`;
  };

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
      } else if (data.type === "map_tap") {
        if (allowFullscreen && !isFullscreen) {
          setIsFullscreen(true);
        }
        if (onMapClick) {
          onMapClick({ lat: data.lat, lng: data.lng });
        }
      }
    } catch (e) {
      console.warn("Error parsing Leaflet WebView message", e);
    }
  };

  return (
    <>
      {/* 1. Inline Map Card with Click-to-Fullscreen */}
      <View style={[styles.container, { height }]}>
        <WebViewComponent
          ref={webViewRef}
          originWhitelist={["*"]}
          source={{ html: getHtmlContent(false) }}
          style={styles.webview}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          scrollEnabled={true}
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

        {/* Floating Overlay with Fullscreen Expand Pill */}
        <View style={styles.headerOverlay} pointerEvents="box-none">
          <View style={styles.zonePill}>
            <View style={styles.zoneDot} />
            <Text style={styles.zoneText}>Bhopal Zone (23.2599°N, 77.4126°E)</Text>
          </View>

          {allowFullscreen && (
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.fullscreenBtn}
              onPress={() => setIsFullscreen(true)}
            >
              <Feather name="maximize-2" size={12} color="#FFFFFF" />
              <Text style={styles.fullscreenBtnText}>Full Screen</Text>
            </TouchableOpacity>
          )}
        </View>

        {showRoute && (
          <View style={styles.routeOverlay} pointerEvents="box-none">
            <View style={styles.routePill}>
              <Feather name="navigation" size={11} color="#2563EB" />
              <Text style={styles.routeText}>
                {distanceKm ? `${distanceKm.toFixed(1)} km` : "Routing Active"}
                {etaMinutes ? ` · ${etaMinutes}m` : ""}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* 2. Fullscreen Interactive Map Modal with Google Maps-like Pinch-to-Zoom */}
      {allowFullscreen && (
        <Modal
          visible={isFullscreen}
          animationType="fade"
          onRequestClose={() => setIsFullscreen(false)}
          statusBarTranslucent={true}
        >
          <View style={styles.fullscreenModalContainer}>
            <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

            {/* Fullscreen Header Bar */}
            <SafeAreaView style={styles.fullscreenHeaderSafe}>
              <View style={styles.fullscreenHeader}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.closeBtn}
                  onPress={() => setIsFullscreen(false)}
                >
                  <Feather name="arrow-left" size={20} color="#FFFFFF" />
                  <Text style={styles.closeBtnText}>Back</Text>
                </TouchableOpacity>

                <View style={styles.fullscreenTitleCol}>
                  <Text style={styles.fullscreenTitle}>Bhopal City Telemetry</Text>
                  <Text style={styles.fullscreenSubtitle}>Pinch to Zoom · Real OpenStreetMap</Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.minimizeIconBtn}
                  onPress={() => setIsFullscreen(false)}
                >
                  <Feather name="minimize-2" size={18} color="#38BDF8" />
                </TouchableOpacity>
              </View>
            </SafeAreaView>

            {/* Fullscreen Leaflet WebView */}
            <View style={styles.fullscreenWebviewWrapper}>
              <WebViewComponent
                ref={fullscreenWebViewRef}
                originWhitelist={["*"]}
                source={{ html: getHtmlContent(true) }}
                style={styles.webview}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                scrollEnabled={true}
                scalesPageToFit={false}
                onMessage={handleMessage}
                renderLoading={() => (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={COLORS.brandBlue} />
                    <Text style={styles.loadingText}>Opening Full Screen Bhopal Grid...</Text>
                  </View>
                )}
                startInLoadingState={true}
              />
            </View>

            {/* Route Status in Fullscreen */}
            {showRoute && (
              <View style={styles.fullscreenRouteBanner} pointerEvents="box-none">
                <View style={styles.fullscreenRoutePill}>
                  <Feather name="navigation" size={14} color="#2563EB" />
                  <Text style={styles.fullscreenRouteText}>
                    Navigating to Incident · {distanceKm ? `${distanceKm.toFixed(1)} km` : "Active"}
                    {etaMinutes ? ` (${etaMinutes} min arrival)` : ""}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </Modal>
      )}
    </>
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
    backgroundColor: "rgba(15, 23, 42, 0.88)",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
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
    fontWeight: "700",
  },
  fullscreenBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(37, 99, 235, 0.9)",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  fullscreenBtnText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  routeOverlay: {
    position: "absolute",
    bottom: 8,
    left: 8,
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

  // Fullscreen Modal Styles
  fullscreenModalContainer: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  fullscreenHeaderSafe: {
    backgroundColor: "#0F172A",
    zIndex: 10,
  },
  fullscreenHeader: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  closeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
  },
  closeBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  fullscreenTitleCol: {
    alignItems: "center",
  },
  fullscreenTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  fullscreenSubtitle: {
    color: "#38BDF8",
    fontSize: 10,
    fontWeight: "600",
  },
  minimizeIconBtn: {
    padding: 8,
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.3)",
  },
  fullscreenWebviewWrapper: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  fullscreenRouteBanner: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 80,
    zIndex: 100,
  },
  fullscreenRoutePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  fullscreenRouteText: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "800",
  },
});
