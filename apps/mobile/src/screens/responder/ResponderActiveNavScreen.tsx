import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, SHADOWS } from "../../theme";
import { RadarMapGrid } from "../../components/radar/RadarMapGrid";
import { ResponderJob } from "../../types";

interface ResponderActiveNavScreenProps {
  activeJob: ResponderJob | null;
  onMarkArrived: () => void;
}

export const ResponderActiveNavScreen: React.FC<ResponderActiveNavScreenProps> = ({
  activeJob,
  onMarkArrived,
}) => {
  const [arrived, setArrived] = useState(false);

  const handleArrived = () => {
    setArrived(true);
    onMarkArrived();
    Alert.alert(
      "✅ Arrived at Scene",
      "Control Room and Citizen have been notified that Unit F-2 is actively on scene.",
      [{ text: "OK" }]
    );
  };

  const handleShowDetails = () => {
    Alert.alert(
      "Incident 402 Details",
      "Category: Fire & Smoke\nSeverity: High\nReported: Market Road near Old Bus Stand\nAI Assessment: Dense smoke plume observed. Multi-source calls verified."
    );
  };

  return (
    <View style={styles.container}>
      {/* Route Status Banner */}
      <View style={styles.statusStrip}>
        <Text style={styles.statusStripText}>
          {arrived ? "STATUS: ON SCENE" : "EN ROUTE to Market road"}
        </Text>
      </View>

      {/* Turn-by-Turn Guidance Banner (From Reference Image 2 Screen 2) */}
      <View style={styles.guidanceBanner}>
        <View style={styles.arrowIconBox}>
          <Feather name="corner-up-left" size={24} color="#FFFFFF" />
        </View>
        <Text style={styles.guidanceText}>
          {arrived ? "You have arrived at target location" : "Turn left in 200 m"}
        </Text>
      </View>

      {/* Map Area with Route Polyline */}
      <View style={styles.mapArea}>
        <RadarMapGrid
          height={320}
          showRoute={true}
          activeMarkerTitle="Incident 402: Fire & Smoke"
          etaText="4 min"
        />
      </View>

      {/* Bottom Info Sheet */}
      <View style={styles.bottomSheet}>
        <View style={styles.sheetHeader}>
          <View>
            <Text style={styles.sheetTitle}>
              {activeJob ? activeJob.title : "Fire & Smoke, Market road"}
            </Text>
            <Text style={styles.sheetMeta}>4 min · 1.7 km</Text>
          </View>
          <View style={styles.liveTag}>
            <Text style={styles.liveTagText}>GPS LIVE</Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleArrived}
          style={[styles.arrivedBtn, arrived && styles.arrivedBtnDone]}
        >
          <Text style={styles.arrivedBtnText}>
            {arrived ? "✓ On Scene (Work in Progress)" : "Arrived at scene"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleShowDetails}
          style={styles.detailsBtn}
        >
          <Text style={styles.detailsBtnText}>View incident details</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  statusStrip: {
    backgroundColor: "#FEE2E2",
    paddingVertical: 6,
    alignItems: "center",
  },
  statusStripText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#DC2626",
    letterSpacing: 0.5,
  },
  guidanceBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: "#0F172A", // Dark navy header banner
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    ...SHADOWS.card,
  },
  arrowIconBox: {
    marginRight: 12,
  },
  guidanceText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  mapArea: {
    flex: 1,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 20,
    overflow: "hidden",
    ...SHADOWS.card,
  },
  bottomSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    ...SHADOWS.tabBar,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  sheetMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  liveTag: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  liveTagText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#059669",
  },
  arrivedBtn: {
    backgroundColor: "#1E293B", // Reference dark blue button
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 8,
  },
  arrivedBtnDone: {
    backgroundColor: "#059669",
  },
  arrivedBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  detailsBtn: {
    paddingVertical: 10,
    alignItems: "center",
  },
  detailsBtnText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
});
