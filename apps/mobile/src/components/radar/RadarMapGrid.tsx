import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, Text, Dimensions } from "react-native";
import Svg, { Rect, Line, Circle, Path } from "react-native-svg";
import { COLORS } from "../../theme";

interface RadarMapGridProps {
  height?: number;
  showRoute?: boolean;
  activeMarkerTitle?: string;
  etaText?: string;
}

export const RadarMapGrid: React.FC<RadarMapGridProps> = ({
  height = 240,
  showRoute = false,
  activeMarkerTitle,
  etaText,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.4,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [pulseAnim]);

  return (
    <View style={[styles.container, { height }]}>
      <Svg width="100%" height="100%" viewBox="0 0 340 220">
        {/* Base Map Background */}
        <Rect x="0" y="0" width="340" height="220" fill="#E8F1F5" rx="16" />

        {/* City Blocks / Campus buildings */}
        <Rect x="15" y="15" width="80" height="55" fill="#DCE8EE" rx="6" />
        <Rect x="110" y="15" width="115" height="55" fill="#DCE8EE" rx="6" />
        <Rect x="240" y="15" width="85" height="55" fill="#DCE8EE" rx="6" />

        <Rect x="15" y="85" width="80" height="60" fill="#DCE8EE" rx="6" />
        <Rect x="110" y="85" width="115" height="60" fill="#DCE8EE" rx="6" />
        <Rect x="240" y="85" width="85" height="60" fill="#DCE8EE" rx="6" />

        <Rect x="15" y="160" width="80" height="45" fill="#DCE8EE" rx="6" />
        <Rect x="110" y="160" width="115" height="45" fill="#DCE8EE" rx="6" />
        <Rect x="240" y="160" width="85" height="45" fill="#DCE8EE" rx="6" />

        {/* Roads (White Grid Channels) */}
        <Line x1="0" y1="77" x2="340" y2="77" stroke="#FFFFFF" strokeWidth="14" />
        <Line x1="0" y1="152" x2="340" y2="152" stroke="#FFFFFF" strokeWidth="14" />
        <Line x1="102" y1="0" x2="102" y2="220" stroke="#FFFFFF" strokeWidth="14" />
        <Line x1="232" y1="0" x2="232" y2="220" stroke="#FFFFFF" strokeWidth="14" />

        {/* Navigation Route (for Active Nav) */}
        {showRoute ? (
          <Path
            d="M 60 190 L 60 77 L 232 77"
            fill="none"
            stroke="#2563EB"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          /* Dashed connection for nearby alert */
          <Line
            x1="102"
            y1="77"
            x2="175"
            y2="77"
            stroke="#059669"
            strokeWidth="3"
            strokeDasharray="4 4"
          />
        )}

        {/* Static Amber Hotspot (Accident) */}
        <Circle cx="215" cy="140" r="28" fill="#FDE68A" opacity="0.6" />
        <Circle cx="215" cy="140" r="14" fill="#F59E0B" opacity="0.8" />
        <Circle cx="215" cy="140" r="5" fill="#B45309" />

        {/* Static Green Responder Dot */}
        <Circle cx="102" cy="77" r="6" fill="#059669" stroke="#FFFFFF" strokeWidth="2" />
        <Circle cx="232" cy="152" r="5" fill="#059669" />

        {/* Incident Hotspot Red (Fire & Smoke) */}
        <Circle cx="175" cy="77" r="32" fill="#FCA5A5" opacity="0.5" />
        <Circle cx="175" cy="77" r="18" fill="#EF4444" opacity="0.8" />
        <Circle cx="175" cy="77" r="7" fill="#B91C1C" stroke="#FFFFFF" strokeWidth="2" />

        {/* Responder / Citizen Start Marker if route is on */}
        {showRoute ? (
          <Circle cx="60" cy="190" r="7" fill="#2563EB" stroke="#FFFFFF" strokeWidth="2" />
        ) : (
          <Circle cx="150" cy="152" r="6" fill="#1E293B" stroke="#FFFFFF" strokeWidth="2" />
        )}
      </Svg>

      {/* Floating Info Overlay */}
      {activeMarkerTitle ? (
        <View style={styles.floatingBadge}>
          <View style={styles.redDot} />
          <Text style={styles.floatingTitle}>{activeMarkerTitle}</Text>
          {etaText ? <Text style={styles.floatingEta}> · {etaText}</Text> : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#E8F1F5",
    position: "relative",
  },
  floatingBadge: {
    position: "absolute",
    bottom: 12,
    left: 14,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.sosPrimary,
    marginRight: 6,
  },
  floatingTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  floatingEta: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textSecondary,
  },
});
