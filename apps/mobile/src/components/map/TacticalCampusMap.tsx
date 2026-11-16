import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
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

// Campus center coordinates (Northridge Campus)
export const DEFAULT_CAMPUS_CENTER: GeoPoint = {
  lat: 28.5452,
  lng: 77.2731,
};

// Key campus architectural buildings
export const CAMPUS_BUILDINGS = [
  { id: "quad", name: "Central Quad", code: "QUAD", lat: 28.5452, lng: 77.2731, w: 90, h: 70, fill: "#E2F1E8", stroke: "#A7D7B9" },
  { id: "lib", name: "Central Library", code: "LIB", lat: 28.5440, lng: 77.2745, w: 75, h: 55, fill: "#E8EEF5", stroke: "#CBD5E1" },
  { id: "sci", name: "Science & Tech Hub", code: "SCI", lat: 28.5465, lng: 77.2715, w: 85, h: 60, fill: "#E8EEF5", stroke: "#CBD5E1" },
  { id: "eng", name: "Engineering Wing", code: "ENG", lat: 28.5472, lng: 77.2732, w: 80, h: 50, fill: "#E8EEF5", stroke: "#CBD5E1" },
  { id: "med", name: "Health & Medical Center", code: "MED", lat: 28.5435, lng: 77.2720, w: 70, h: 50, fill: "#FEE2E2", stroke: "#FCA5A5" },
  { id: "adm", name: "Admin Command Block", code: "ADM", lat: 28.5458, lng: 77.2742, w: 65, h: 50, fill: "#E8EEF5", stroke: "#CBD5E1" },
  { id: "res", name: "Student Hostels", code: "RES", lat: 28.5470, lng: 77.2755, w: 95, h: 65, fill: "#F1F5F9", stroke: "#CBD5E1" },
  { id: "spt", name: "Sports Arena & Track", code: "SPT", lat: 28.5420, lng: 77.2750, w: 100, h: 65, fill: "#FEF3C7", stroke: "#FDE68A" },
  { id: "gate1", name: "Main North Gate", code: "GATE 1", lat: 28.5485, lng: 77.2730, w: 50, h: 25, fill: "#F8FAFC", stroke: "#94A3B8" },
  { id: "gate3", name: "South Gate 3", code: "GATE 3", lat: 28.5415, lng: 77.2732, w: 50, h: 25, fill: "#F8FAFC", stroke: "#94A3B8" },
];

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
  height = 300,
  selfPoint = { lat: 28.5455, lng: 77.2735 },
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
  const [selectedItem, setSelectedItem] = useState<{
    type: "incident" | "responder";
    data: any;
  } | null>(null);

  // Layer filters
  const [showIncidentsLayer, setShowIncidentsLayer] = useState(true);
  const [showRespondersLayer, setShowRespondersLayer] = useState(true);
  const [showGeofenceLayer, setShowGeofenceLayer] = useState(true);

  // Animated pulse for active incidents
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 2.2,
            duration: 1600,
            useNativeDriver: false,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 1600,
            useNativeDriver: false,
          }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, {
            toValue: 0.15,
            duration: 1600,
            useNativeDriver: false,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.7,
            duration: 1600,
            useNativeDriver: false,
          }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim, pulseOpacity]);

  // Coordinate projection math
  // Maps GPS (lat, lng) to canvas pixels (x, y) relative to campus center
  const center = DEFAULT_CAMPUS_CENTER;
  const scale = useMemo(() => {
    // Zoom factor: at zoom 16, 0.001 deg ≈ 55px
    return Math.pow(2, zoom - 16) * 55000;
  }, [zoom]);

  const projectToCanvas = (lat: number, lng: number) => {
    const deltaLng = (lng - center.lng) * Math.cos((center.lat * Math.PI) / 180);
    const deltaLat = lat - center.lat;

    const x = containerWidth / 2 + deltaLng * scale + panOffset.x;
    const y = height / 2 - deltaLat * scale + panOffset.y;

    return { x, y };
  };

  // Touch Pan gesture responder
  const panStartRef = useRef({ x: 0, y: 0 });
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => interactive,
      onMoveShouldSetPanResponder: (_, gesture) =>
        interactive && (Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4),
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

  // Zoom controls
  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.5, 18));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.5, 14));
  const handleRecenterSelf = () => {
    if (selfPoint) {
      const deltaLng = (selfPoint.lng - center.lng) * Math.cos((center.lat * Math.PI) / 180);
      const deltaLat = selfPoint.lat - center.lat;
      setPanOffset({
        x: -deltaLng * scale,
        y: deltaLat * scale,
      });
    } else {
      setPanOffset({ x: 0, y: 0 });
    }
  };

  const handleRecenterTarget = () => {
    if (targetIncident) {
      const deltaLng = (targetIncident.lng - center.lng) * Math.cos((center.lat * Math.PI) / 180);
      const deltaLat = targetIncident.lat - center.lat;
      setPanOffset({
        x: -deltaLng * scale,
        y: deltaLat * scale,
      });
    }
  };

  // Campus geofence boundary points
  const geofencePolygonPoints = useMemo(() => {
    const corners = [
      { lat: center.lat + 0.0038, lng: center.lng - 0.0042 },
      { lat: center.lat + 0.0040, lng: center.lng + 0.0045 },
      { lat: center.lat - 0.0039, lng: center.lng + 0.0043 },
      { lat: center.lat - 0.0037, lng: center.lng - 0.0040 },
    ];
    return corners
      .map((c) => {
        const pt = projectToCanvas(c.lat, c.lng);
        return `${pt.x},${pt.y}`;
      })
      .join(" ");
  }, [center, scale, panOffset, containerWidth, height]);

  // Arterial Walkways & Roadways (campus channels)
  const walkways = useMemo(() => {
    const pNorth = projectToCanvas(center.lat + 0.0035, center.lng);
    const pSouth = projectToCanvas(center.lat - 0.0035, center.lng);
    const pWest = projectToCanvas(center.lat, center.lng - 0.0035);
    const pEast = projectToCanvas(center.lat, center.lng + 0.0035);
    const pCenter = projectToCanvas(center.lat, center.lng);

    return {
      verticalRoad: `M ${pNorth.x} ${pNorth.y} L ${pSouth.x} ${pSouth.y}`,
      horizontalRoad: `M ${pWest.x} ${pWest.y} L ${pEast.x} ${pEast.y}`,
      innerRing: `M ${pCenter.x - 65} ${pCenter.y - 50} L ${pCenter.x + 65} ${pCenter.y - 50} L ${pCenter.x + 65} ${pCenter.y + 50} L ${pCenter.x - 65} ${pCenter.y + 50} Z`,
    };
  }, [center, scale, panOffset, containerWidth, height]);

  // Navigation Route Path calculation
  const routePathD = useMemo(() => {
    if (!showRoute) return "";

    const startPt = projectToCanvas(selfPoint.lat, selfPoint.lng);
    const targetPt = targetIncident
      ? projectToCanvas(targetIncident.lat, targetIncident.lng)
      : projectToCanvas(center.lat + 0.001, center.lng + 0.0012);

    if (routeCoordinates && routeCoordinates.length >= 2) {
      return routeCoordinates
        .map((coord, i) => {
          const pt = projectToCanvas(coord[0], coord[1]);
          return `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`;
        })
        .join(" ");
    }

    // Default realistic orthogonal campus walkway path
    const midX = targetPt.x;
    const midY = startPt.y;
    return `M ${startPt.x} ${startPt.y} L ${midX} ${midY} L ${targetPt.x} ${targetPt.y}`;
  }, [showRoute, selfPoint, targetIncident, routeCoordinates, center, scale, panOffset, containerWidth, height]);

  // Self Location
  const selfCoords = projectToCanvas(selfPoint.lat, selfPoint.lng);

  return (
    <View style={[styles.container, { height }]}>
      {/* SVG Vector Map Canvas */}
      <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="mapBgGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#EEF4F7" />
              <Stop offset="100%" stopColor="#E5EDF1" />
            </LinearGradient>

            <RadialGradient id="pulseGlowRed" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#E11D48" stopOpacity="0.45" />
              <Stop offset="70%" stopColor="#E11D48" stopOpacity="0.15" />
              <Stop offset="100%" stopColor="#E11D48" stopOpacity="0" />
            </RadialGradient>

            <RadialGradient id="selfGlowBlue" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#0284C7" stopOpacity="0.3" />
              <Stop offset="100%" stopColor="#0284C7" stopOpacity="0" />
            </RadialGradient>
          </Defs>

          {/* Map Base Canvas */}
          <Rect x="0" y="0" width={containerWidth} height={height} fill="url(#mapBgGrad)" rx={20} />

          {/* Campus Geofence Boundary Polygon */}
          {showGeofenceLayer && (
            <G>
              <Polygon
                points={geofencePolygonPoints}
                fill="rgba(37, 99, 235, 0.05)"
                stroke="#2563EB"
                strokeWidth="2"
                strokeDasharray="6 4"
                strokeOpacity={0.6}
              />
            </G>
          )}

          {/* Pedestrian Walkways & Main Arterials */}
          <Path
            d={walkways.verticalRoad}
            stroke="#FFFFFF"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <Path
            d={walkways.horizontalRoad}
            stroke="#FFFFFF"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <Path
            d={walkways.innerRing}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="10"
            strokeLinejoin="round"
          />

          {/* Campus Buildings */}
          {CAMPUS_BUILDINGS.map((b) => {
            const pt = projectToCanvas(b.lat, b.lng);
            const w = (b.w * scale) / 55000;
            const h = (b.h * scale) / 55000;

            return (
              <G key={b.id}>
                {/* Building Drop Shadow */}
                <Rect
                  x={pt.x - w / 2 + 2}
                  y={pt.y - h / 2 + 2}
                  width={w}
                  height={h}
                  fill="rgba(15, 23, 42, 0.06)"
                  rx={6}
                />
                {/* Building Footprint */}
                <Rect
                  x={pt.x - w / 2}
                  y={pt.y - h / 2}
                  width={w}
                  height={h}
                  fill={b.fill}
                  stroke={b.stroke}
                  strokeWidth="1.5"
                  rx={6}
                />
                {/* Building Label */}
                {zoom >= 15.5 && (
                  <SvgText
                    x={pt.x}
                    y={pt.y + 4}
                    fontSize={zoom >= 16.5 ? 9 : 8}
                    fontWeight="bold"
                    fill="#334155"
                    textAnchor="middle"
                  >
                    {b.code}
                  </SvgText>
                )}
              </G>
            );
          })}

          {/* Navigation Polyline Route */}
          {showRoute && routePathD && (
            <G>
              {/* Outer Blue Route Glow */}
              <Path
                d={routePathD}
                fill="none"
                stroke="#2563EB"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity={0.3}
              />
              {/* Core Active Route Line */}
              <Path
                d={routePathD}
                fill="none"
                stroke="#0284C7"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </G>
          )}

          {/* Incidents Markers */}
          {showIncidentsLayer &&
            incidents.map((inc) => {
              const pt = projectToCanvas(inc.lat, inc.lng);
              const isSelected = selectedItem?.data?.id === inc.id;
              const isCritical = inc.urgency === "critical" || inc.category === "personal_sos";

              const color =
                inc.category === "fire_smoke" || isCritical
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
                    setSelectedItem({ type: "incident", data: inc });
                    if (onSelectIncident) onSelectIncident(inc);
                  }}
                >
                  {/* Concentric Pulsing Radar Waves */}
                  <Circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isCritical ? 36 : 24}
                    fill={color}
                    opacity={0.16}
                  />
                  <Circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isCritical ? 20 : 14}
                    fill={color}
                    opacity={0.35}
                  />

                  {/* Core Pin */}
                  <Circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isSelected ? 10 : 8}
                    fill={color}
                    stroke="#FFFFFF"
                    strokeWidth="2.5"
                  />

                  {/* Incident Indicator Badge */}
                  {zoom >= 15.5 && (
                    <G>
                      <Rect
                        x={pt.x - 28}
                        y={pt.y - 22}
                        width={56}
                        height={14}
                        fill="#0F172A"
                        rx={7}
                      />
                      <SvgText
                        x={pt.x}
                        y={pt.y - 12}
                        fontSize={8}
                        fontWeight="bold"
                        fill="#FFFFFF"
                        textAnchor="middle"
                      >
                        {inc.category.replace("_", " ").toUpperCase().slice(0, 9)}
                      </SvgText>
                    </G>
                  )}
                </G>
              );
            })}

          {/* Responders Markers */}
          {showRespondersLayer &&
            responders.map((r) => {
              const pt = projectToCanvas(r.lat, r.lng);
              const isSelected = selectedItem?.data?.id === r.id;

              return (
                <G
                  key={r.id}
                  onPress={() => {
                    setSelectedItem({ type: "responder", data: r });
                    if (onSelectResponder) onSelectResponder(r);
                  }}
                >
                  {/* Unit Status Halo */}
                  <Circle
                    cx={pt.x}
                    cy={pt.y}
                    r={16}
                    fill={r.isOnDuty ? "#10B981" : "#94A3B8"}
                    opacity={0.2}
                  />

                  {/* Unit Badge Container */}
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
                    fontSize={9}
                    fontWeight="bold"
                    fill="#FFFFFF"
                    textAnchor="middle"
                  >
                    {r.unitCode || "F-2"}
                  </SvgText>
                </G>
              );
            })}

          {/* User's Self Location Dot */}
          <G>
            <Circle cx={selfCoords.x} cy={selfCoords.y} r={22} fill="url(#selfGlowBlue)" />
            <Circle cx={selfCoords.x} cy={selfCoords.y} r={8} fill="#0284C7" stroke="#FFFFFF" strokeWidth="2.5" />
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
            style={[styles.layerPill, showIncidentsLayer && styles.layerPillActive]}
            onPress={() => setShowIncidentsLayer(!showIncidentsLayer)}
          >
            <Text style={[styles.layerPillText, showIncidentsLayer && styles.layerPillTextActive]}>
              🔥 Incidents
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.layerPill, showRespondersLayer && styles.layerPillActive]}
            onPress={() => setShowRespondersLayer(!showRespondersLayer)}
          >
            <Text style={[styles.layerPillText, showRespondersLayer && styles.layerPillTextActive]}>
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

      {/* Selected Marker Detail Sheet (Appears when any marker is tapped) */}
      {selectedItem && (
        <View style={styles.detailHudCard}>
          <View style={styles.hudHeader}>
            <View style={styles.hudTitleRow}>
              <View
                style={[
                  styles.hudCategoryDot,
                  {
                    backgroundColor:
                      selectedItem.type === "incident" ? COLORS.sosPrimary : COLORS.dutyPrimary,
                  },
                ]}
              />
              <Text style={styles.hudTitle} numberOfLines={1}>
                {selectedItem.data.title || selectedItem.data.displayName || "Selected Item"}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedItem(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          <Text style={styles.hudSub}>
            {selectedItem.data.locationLabel || `${selectedItem.data.lat.toFixed(4)}, ${selectedItem.data.lng.toFixed(4)}`}
          </Text>

          {selectedItem.type === "incident" && (
            <View style={styles.hudMetaRow}>
              <View style={styles.hudBadge}>
                <Text style={styles.hudBadgeText}>
                  {(selectedItem.data.urgency || "HIGH").toUpperCase()}
                </Text>
              </View>
              {selectedItem.data.distanceLabel && (
                <Text style={styles.hudDistText}>{selectedItem.data.distanceLabel}</Text>
              )}
            </View>
          )}

          {selectedItem.type === "responder" && (
            <View style={styles.hudMetaRow}>
              <View style={[styles.hudBadge, { backgroundColor: "#D1FAE5" }]}>
                <Text style={[styles.hudBadgeText, { color: "#065F46" }]}>
                  {selectedItem.data.isOnDuty ? "ON DUTY" : "OFF DUTY"}
                </Text>
              </View>
              <Text style={styles.hudDistText}>Unit Code: {selectedItem.data.unitCode}</Text>
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
    backgroundColor: "rgba(15, 23, 42, 0.8)",
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
    backgroundColor: "rgba(255, 255, 255, 0.9)",
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
