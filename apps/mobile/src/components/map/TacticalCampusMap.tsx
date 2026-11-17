import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  Dimensions,
} from "react-native";
import Svg, {
  Rect,
  Circle,
  Path,
  Line,
  Polygon,
  G,
  Text as SvgText,
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
} from "react-native-svg";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, SHADOWS } from "../../theme";
import { GeoPoint, IncidentCategory, IncidentUrgency } from "../../types";

export const CAMPUS_CENTER: GeoPoint = {
  lat: 28.5452,
  lng: 77.2731,
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

export interface TacticalCampusMapProps {
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
  interactive?: boolean;
}

export const TacticalCampusMap: React.FC<TacticalCampusMapProps> = ({
  height = 240,
  selfPoint = { lat: 28.5452, lng: 77.2731 },
  incidents = [],
  responders = [],
  targetIncident,
  showRoute = false,
  routeCoordinates,
  etaMinutes,
  distanceKm,
  onSelectIncident,
  onSelectResponder,
  interactive = true,
}) => {
  const containerWidth = Dimensions.get("window").width - 32;

  // Zoom & Pan state
  const [zoom, setZoom] = useState(16); // 14 to 18
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [selectedMarker, setSelectedMarker] = useState<{
    type: "incident" | "responder";
    data: any;
  } | null>(null);

  // Layer toggles
  const [showIncidents, setShowIncidents] = useState(true);
  const [showResponders, setShowResponders] = useState(true);
  const [showBoundary, setShowBoundary] = useState(true);

  // Animated pulse for incidents and user beacon
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 2.2,
            duration: 1500,
            useNativeDriver: false,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 1500,
            useNativeDriver: false,
          }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, {
            toValue: 0.1,
            duration: 1500,
            useNativeDriver: false,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.8,
            duration: 1500,
            useNativeDriver: false,
          }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim, pulseOpacity]);

  // Coordinate projection math
  const center = CAMPUS_CENTER;
  const scale = useMemo(() => {
    return Math.pow(2, zoom - 16) * 52000;
  }, [zoom]);

  const toCanvas = (lat: number, lng: number) => {
    const dLng = (lng - center.lng) * Math.cos((center.lat * Math.PI) / 180);
    const dLat = lat - center.lat;
    const x = containerWidth / 2 + dLng * scale + panOffset.x;
    const y = height / 2 - dLat * scale + panOffset.y;
    return { x, y };
  };

  // Touch Pan Gesture Handling
  const panStartRef = useRef({ x: 0, y: 0 });
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => interactive,
      onMoveShouldSetPanResponder: (_, gesture) =>
        interactive && (Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3),
      onPanResponderGrant: () => {
        panStartRef.current = { ...panOffset };
      },
      onPanResponderMove: (_, gesture) => {
        setPanOffset({
          x: panStartRef.current.x + gesture.dx,
          y: panStartRef.current.y + gesture.dy,
        });
      },
    })
  ).current;

  // Zoom and Recenter Controls
  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.5, 18));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.5, 14));
  const handleRecenterSelf = () => {
    if (selfPoint) {
      const dLng = (selfPoint.lng - center.lng) * Math.cos((center.lat * Math.PI) / 180);
      const dLat = selfPoint.lat - center.lat;
      setPanOffset({ x: -dLng * scale, y: dLat * scale });
    } else {
      setPanOffset({ x: 0, y: 0 });
    }
  };

  const handleRecenterTarget = () => {
    if (targetIncident) {
      const dLng = (targetIncident.lng - center.lng) * Math.cos((center.lat * Math.PI) / 180);
      const dLat = targetIncident.lat - center.lat;
      setPanOffset({ x: -dLng * scale, y: dLat * scale });
    }
  };

  // Fixed visual landmarks projected to canvas
  const pGate1 = toCanvas(center.lat + 0.0035, center.lng);
  const pGate3 = toCanvas(center.lat - 0.0035, center.lng);
  const pWestEnd = toCanvas(center.lat, center.lng - 0.004);
  const pEastEnd = toCanvas(center.lat, center.lng + 0.004);
  const pQuadCenter = toCanvas(center.lat, center.lng);

  // Specific buildings with realistic footprints
  const buildings = useMemo(() => {
    const list = [
      {
        id: "lib",
        name: "Central Library",
        code: "LIBRARY",
        lat: center.lat - 0.0012,
        lng: center.lng + 0.0014,
        w: 68,
        h: 46,
        color: "#F1F5F9",
        border: "#CBD5E1",
      },
      {
        id: "sci",
        name: "Science & Tech Hub",
        code: "SCIENCE HUB",
        lat: center.lat + 0.0013,
        lng: center.lng - 0.0016,
        w: 78,
        h: 52,
        color: "#F1F5F9",
        border: "#CBD5E1",
      },
      {
        id: "eng",
        name: "Engineering Hall",
        code: "ENGINEERING",
        lat: center.lat + 0.002,
        lng: center.lng + 0.0001,
        w: 74,
        h: 44,
        color: "#F1F5F9",
        border: "#CBD5E1",
      },
      {
        id: "med",
        name: "Campus Medical Clinic",
        code: "HEALTH CLINIC",
        lat: center.lat - 0.0017,
        lng: center.lng - 0.0011,
        w: 60,
        h: 42,
        color: "#FFF1F2",
        border: "#FDA4AF",
        isMedical: true,
      },
      {
        id: "adm",
        name: "Admin Command Block",
        code: "ADMIN TOWER",
        lat: center.lat + 0.0006,
        lng: center.lng + 0.0011,
        w: 58,
        h: 42,
        color: "#F8FAFC",
        border: "#94A3B8",
      },
      {
        id: "res",
        name: "Student Hostels",
        code: "HOSTEL COMPLEX",
        lat: center.lat + 0.0018,
        lng: center.lng + 0.0024,
        w: 84,
        h: 56,
        color: "#F1F5F9",
        border: "#CBD5E1",
      },
    ];

    return list.map((b) => {
      const pt = toCanvas(b.lat, b.lng);
      const scaledW = (b.w * scale) / 52000;
      const scaledH = (b.h * scale) / 52000;
      return { ...b, pt, w: scaledW, h: scaledH };
    });
  }, [center, scale, panOffset, containerWidth, height]);

  // Campus Perimeter Geofence
  const boundaryPoints = useMemo(() => {
    const coords = [
      { lat: center.lat + 0.0036, lng: center.lng - 0.0038 },
      { lat: center.lat + 0.0038, lng: center.lng + 0.0039 },
      { lat: center.lat - 0.0036, lng: center.lng + 0.0038 },
      { lat: center.lat - 0.0035, lng: center.lng - 0.0036 },
    ];
    return coords.map((c) => {
      const pt = toCanvas(c.lat, c.lng);
      return `${pt.x},${pt.y}`;
    }).join(" ");
  }, [center, scale, panOffset, containerWidth, height]);

  // Dynamic Navigation Route Polyline
  const routePolyline = useMemo(() => {
    if (!showRoute && !targetIncident) return null;

    const start = toCanvas(selfPoint.lat, selfPoint.lng);
    const end = targetIncident
      ? toCanvas(targetIncident.lat, targetIncident.lng)
      : toCanvas(center.lat + 0.0015, center.lng - 0.001);

    // If start and end are practically identical, provide a visible approach path
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 15) {
      // Draw a neat route from main entrance to the incident
      const approachFrom = toCanvas(center.lat - 0.0025, center.lng);
      const midPoint = toCanvas(center.lat, center.lng);
      return {
        path: `M ${approachFrom.x} ${approachFrom.y} L ${midPoint.x} ${midPoint.y} L ${end.x} ${end.y}`,
        mid: { x: (midPoint.x + end.x) / 2, y: (midPoint.y + end.y) / 2 },
      };
    }

    // Realistic orthogonal campus walkway route
    const cornerX = end.x;
    const cornerY = start.y;
    return {
      path: `M ${start.x} ${start.y} L ${cornerX} ${cornerY} L ${end.x} ${end.y}`,
      mid: { x: cornerX, y: (cornerY + end.y) / 2 },
    };
  }, [showRoute, targetIncident, selfPoint, center, scale, panOffset, containerWidth, height]);

  const selfCoords = toCanvas(selfPoint.lat, selfPoint.lng);

  return (
    <View style={[styles.container, { height }]}>
      {/* Interactive Map Canvas */}
      <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="bgCanvasGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#F1F5F9" />
              <Stop offset="100%" stopColor="#E2E8F0" />
            </LinearGradient>

            <RadialGradient id="selfGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#0284C7" stopOpacity="0.35" />
              <Stop offset="100%" stopColor="#0284C7" stopOpacity="0" />
            </RadialGradient>

            <RadialGradient id="emergencyGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#E11D48" stopOpacity="0.4" />
              <Stop offset="100%" stopColor="#E11D48" stopOpacity="0" />
            </RadialGradient>
          </Defs>

          {/* Base Cartographic Background */}
          <Rect x="0" y="0" width={containerWidth} height={height} fill="url(#bgCanvasGrad)" rx={18} />

          {/* Landscaped Green Areas (Central Quad & Gardens) */}
          <Circle cx={pQuadCenter.x} cy={pQuadCenter.y} r={scale * 0.0014} fill="#DCFCE7" stroke="#BBF7D0" strokeWidth="1" />
          <Circle cx={pQuadCenter.x - scale * 0.0022} cy={pQuadCenter.y - scale * 0.0016} r={scale * 0.001} fill="#E2F1E8" opacity={0.8} />

          {/* Campus Reflection Pond (Water Body) */}
          <Circle cx={pQuadCenter.x + scale * 0.0022} cy={pQuadCenter.y + scale * 0.0018} r={scale * 0.0009} fill="#BAE6FD" stroke="#7DD3FC" strokeWidth="1.5" />

          {/* Campus Boundary Geofence */}
          {showBoundary && (
            <Polygon
              points={boundaryPoints}
              fill="rgba(37, 99, 235, 0.04)"
              stroke="#2563EB"
              strokeWidth="2"
              strokeDasharray="6 4"
              strokeOpacity={0.6}
            />
          )}

          {/* Campus Road Network - Casing (Outlines) */}
          <Line x1={pGate1.x} y1={pGate1.y} x2={pGate3.x} y2={pGate3.y} stroke="#CBD5E1" strokeWidth="18" strokeLinecap="round" />
          <Line x1={pWestEnd.x} y1={pWestEnd.y} x2={pEastEnd.x} y2={pEastEnd.y} stroke="#CBD5E1" strokeWidth="18" strokeLinecap="round" />
          <Circle cx={pQuadCenter.x} cy={pQuadCenter.y} r={scale * 0.0018} fill="none" stroke="#CBD5E1" strokeWidth="14" />

          {/* Campus Road Network - Pavement Surfaces */}
          <Line x1={pGate1.x} y1={pGate1.y} x2={pGate3.x} y2={pGate3.y} stroke="#FFFFFF" strokeWidth="14" strokeLinecap="round" />
          <Line x1={pWestEnd.x} y1={pWestEnd.y} x2={pEastEnd.x} y2={pEastEnd.y} stroke="#FFFFFF" strokeWidth="14" strokeLinecap="round" />
          <Circle cx={pQuadCenter.x} cy={pQuadCenter.y} r={scale * 0.0018} fill="none" stroke="#FFFFFF" strokeWidth="10" />

          {/* Dashed Centerlines on Main Boulevards */}
          <Line x1={pGate1.x} y1={pGate1.y} x2={pGate3.x} y2={pGate3.y} stroke="#F1F5F9" strokeWidth="1.5" strokeDasharray="5 5" />
          <Line x1={pWestEnd.x} y1={pWestEnd.y} x2={pEastEnd.x} y2={pEastEnd.y} stroke="#F1F5F9" strokeWidth="1.5" strokeDasharray="5 5" />

          {/* Street Name Labels */}
          {zoom >= 15.5 && (
            <G>
              <SvgText x={pGate1.x + 8} y={pGate1.y + 40} fill="#64748B" fontSize="8" fontWeight="600">
                Campus Ave
              </SvgText>
              <SvgText x={pEastEnd.x - 70} y={pEastEnd.y - 8} fill="#64748B" fontSize="8" fontWeight="600">
                Northridge Blvd
              </SvgText>
            </G>
          )}

          {/* Architectural Campus Buildings */}
          {buildings.map((b) => (
            <G key={b.id}>
              {/* Drop Shadow */}
              <Rect
                x={b.pt.x - b.w / 2 + 2}
                y={b.pt.y - b.h / 2 + 3}
                width={b.w}
                height={b.h}
                fill="rgba(15, 23, 42, 0.07)"
                rx={6}
              />
              {/* Main Building Body */}
              <Rect
                x={b.pt.x - b.w / 2}
                y={b.pt.y - b.h / 2}
                width={b.w}
                height={b.h}
                fill={b.color}
                stroke={b.border}
                strokeWidth="1.5"
                rx={6}
              />
              {/* Roof Inset Highlight */}
              <Rect
                x={b.pt.x - b.w / 2 + 3}
                y={b.pt.y - b.h / 2 + 3}
                width={b.w - 6}
                height={b.h - 6}
                fill="#FFFFFF"
                opacity={0.65}
                rx={4}
              />
              {/* Building Label */}
              <SvgText
                x={b.pt.x}
                y={b.pt.y + 4}
                fill="#334155"
                fontSize={zoom >= 16.5 ? 8 : 7}
                fontWeight="700"
                textAnchor="middle"
              >
                {b.code}
              </SvgText>
            </G>
          ))}

          {/* Navigation Polyline Route */}
          {routePolyline && (
            <G>
              {/* Blue Outer Glow */}
              <Path
                d={routePolyline.path}
                fill="none"
                stroke="#2563EB"
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity={0.25}
              />
              {/* Core Route Line */}
              <Path
                d={routePolyline.path}
                fill="none"
                stroke="#2563EB"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Inner White Guideline */}
              <Path
                d={routePolyline.path}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
            </G>
          )}

          {/* Incident Hotspots */}
          {showIncidents &&
            incidents.map((inc) => {
              const pt = toCanvas(inc.lat, inc.lng);
              const isSelected = selectedMarker?.data?.id === inc.id;
              const isCrit = inc.urgency === "critical" || inc.category === "personal_sos";

              const pinColor =
                inc.category === "fire_smoke" || isCrit
                  ? COLORS.sosPrimary
                  : inc.category === "road_accident"
                  ? COLORS.warning
                  : inc.category === "medical"
                  ? "#DC2626"
                  : COLORS.brandBlue;

              return (
                <G
                  key={inc.id}
                  onPress={() => {
                    setSelectedMarker({ type: "incident", data: inc });
                    if (onSelectIncident) onSelectIncident(inc);
                  }}
                >
                  {/* Radar Ripple Waves */}
                  <Circle cx={pt.x} cy={pt.y} r={isCrit ? 36 : 24} fill={pinColor} opacity={0.15} />
                  <Circle cx={pt.x} cy={pt.y} r={isCrit ? 20 : 14} fill={pinColor} opacity={0.3} />

                  {/* Pin Base Shadow */}
                  <Circle cx={pt.x} cy={pt.y + 2} r={9} fill="rgba(0,0,0,0.2)" />

                  {/* Core Teardrop Pin */}
                  <Circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isSelected ? 10 : 8}
                    fill={pinColor}
                    stroke="#FFFFFF"
                    strokeWidth="2.5"
                  />

                  {/* Mini Incident Tag */}
                  <Rect
                    x={pt.x - 22}
                    y={pt.y - 20}
                    width={44}
                    height={13}
                    fill="#0F172A"
                    rx={6.5}
                  />
                  <SvgText
                    x={pt.x}
                    y={pt.y - 11}
                    fill="#FFFFFF"
                    fontSize="7"
                    fontWeight="800"
                    textAnchor="middle"
                  >
                    {inc.category.replace("_", " ").slice(0, 8).toUpperCase()}
                  </SvgText>
                </G>
              );
            })}

          {/* Responders Units */}
          {showResponders &&
            responders.map((r) => {
              const pt = toCanvas(r.lat, r.lng);
              const isSelected = selectedMarker?.data?.id === r.id;

              return (
                <G
                  key={r.id}
                  onPress={() => {
                    setSelectedMarker({ type: "responder", data: r });
                    if (onSelectResponder) onSelectResponder(r);
                  }}
                >
                  <Circle cx={pt.x} cy={pt.y} r={16} fill="#10B981" opacity={0.25} />
                  <Rect
                    x={pt.x - 16}
                    y={pt.y - 10}
                    width={32}
                    height={20}
                    fill="#0F172A"
                    stroke="#10B981"
                    strokeWidth="1.5"
                    rx={6}
                  />
                  <SvgText
                    x={pt.x}
                    y={pt.y + 4}
                    fontSize="9"
                    fontWeight="bold"
                    fill="#FFFFFF"
                    textAnchor="middle"
                  >
                    {r.unitCode || "F-2"}
                  </SvgText>
                </G>
              );
            })}

          {/* User's GPS Location */}
          <G>
            <Circle cx={selfCoords.x} cy={selfCoords.y} r={22} fill="url(#selfGlow)" />
            <Circle cx={selfCoords.x} cy={selfCoords.y} r={7} fill="#0284C7" stroke="#FFFFFF" strokeWidth="2.5" />
          </G>
        </Svg>
      </View>

      {/* Map Header Status & Layer Pills */}
      <View style={styles.topBar}>
        <View style={styles.liveGridTag}>
          <View style={styles.liveGreenDot} />
          <Text style={styles.liveGridText}>Live PostGIS Grid</Text>
        </View>

        <View style={styles.layerPillsRow}>
          <TouchableOpacity
            style={[styles.layerPill, showIncidents && styles.layerPillActive]}
            onPress={() => setShowIncidents(!showIncidents)}
          >
            <Text style={[styles.layerPillText, showIncidents && styles.layerPillTextActive]}>
              🔥 Incidents
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.layerPill, showResponders && styles.layerPillActive]}
            onPress={() => setShowResponders(!showResponders)}
          >
            <Text style={[styles.layerPillText, showResponders && styles.layerPillTextActive]}>
              🚒 Units
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Floating Tactical Zoom & Recenter Controls */}
      <View style={styles.floatingControls}>
        <TouchableOpacity style={styles.controlBtn} onPress={handleZoomIn}>
          <Feather name="plus" size={18} color="#0F172A" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlBtn} onPress={handleZoomOut}>
          <Feather name="minus" size={18} color="#0F172A" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlBtn} onPress={handleRecenterSelf}>
          <MaterialCommunityIcons name="crosshairs-gps" size={18} color="#0284C7" />
        </TouchableOpacity>
        {targetIncident && (
          <TouchableOpacity style={[styles.controlBtn, styles.controlBtnTarget]} onPress={handleRecenterTarget}>
            <MaterialCommunityIcons name="target" size={18} color="#E11D48" />
          </TouchableOpacity>
        )}
      </View>

      {/* Bottom Scale & Campus Label */}
      <View style={styles.scaleBar}>
        <Text style={styles.scaleText}>Northridge Campus · OSRM Walkway Grid</Text>
      </View>

      {/* Selected Marker Detail Card */}
      {selectedMarker && (
        <View style={styles.detailHudCard}>
          <View style={styles.hudHeader}>
            <View style={styles.hudTitleRow}>
              <View
                style={[
                  styles.hudCategoryDot,
                  {
                    backgroundColor:
                      selectedMarker.type === "incident" ? COLORS.sosPrimary : COLORS.dutyPrimary,
                  },
                ]}
              />
              <Text style={styles.hudTitle} numberOfLines={1}>
                {selectedMarker.data.title || selectedMarker.data.displayName || "Selected Location"}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedMarker(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          <Text style={styles.hudSub}>
            {selectedMarker.data.locationLabel || `${selectedMarker.data.lat.toFixed(4)}, ${selectedMarker.data.lng.toFixed(4)}`}
          </Text>

          {selectedMarker.type === "incident" && (
            <View style={styles.hudMetaRow}>
              <View style={styles.hudBadge}>
                <Text style={styles.hudBadgeText}>
                  {(selectedMarker.data.urgency || "HIGH").toUpperCase()}
                </Text>
              </View>
              {selectedMarker.data.distanceLabel && (
                <Text style={styles.hudDistText}>{selectedMarker.data.distanceLabel}</Text>
              )}
            </View>
          )}

          {selectedMarker.type === "responder" && (
            <View style={styles.hudMetaRow}>
              <View style={[styles.hudBadge, { backgroundColor: "#D1FAE5" }]}>
                <Text style={[styles.hudBadgeText, { color: "#065F46" }]}>
                  {selectedMarker.data.isOnDuty ? "ON DUTY" : "OFF DUTY"}
                </Text>
              </View>
              <Text style={styles.hudDistText}>Unit Code: {selectedMarker.data.unitCode}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#E2E8F0",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...SHADOWS.card,
  },
  topBar: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  liveGridTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
    marginRight: 6,
  },
  liveGridText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "600",
  },
  layerPillsRow: {
    flexDirection: "row",
    gap: 6,
  },
  layerPill: {
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  layerPillActive: {
    backgroundColor: "#0F172A",
    borderColor: "#0F172A",
  },
  layerPillText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#475569",
  },
  layerPillTextActive: {
    color: "#FFFFFF",
  },
  floatingControls: {
    position: "absolute",
    right: 12,
    bottom: 28,
    gap: 8,
  },
  controlBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    ...SHADOWS.card,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  controlBtnTarget: {
    backgroundColor: "#FFE4E6",
    borderColor: "#FDA4AF",
  },
  scaleBar: {
    position: "absolute",
    left: 12,
    bottom: 8,
  },
  scaleText: {
    fontSize: 9,
    color: "#64748B",
    fontWeight: "500",
  },
  detailHudCard: {
    position: "absolute",
    bottom: 10,
    left: 12,
    right: 56,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 10,
    ...SHADOWS.cardHover,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  hudHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hudTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  hudCategoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  hudTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
  },
  hudSub: {
    fontSize: 10,
    color: "#64748B",
    marginTop: 2,
  },
  hudMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 8,
  },
  hudBadge: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  hudBadgeText: {
    color: "#B91C1C",
    fontSize: 9,
    fontWeight: "700",
  },
  hudDistText: {
    fontSize: 10,
    color: "#475569",
    fontWeight: "500",
  },
});
