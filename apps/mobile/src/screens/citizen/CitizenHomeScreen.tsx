import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity } from "react-native";
import { COLORS, SHADOWS } from "../../theme";
import { SOSRadarButton } from "../../components/radar/SOSRadarButton";
import { CategoryCard } from "../../components/cards/CategoryCard";
import { TacticalCampusMap } from "../../components/map/TacticalCampusMap";
import { ReportWizardModal } from "../../components/modals/ReportWizardModal";
import { IncidentCategory, GeoPoint } from "../../types";
import { mobileApi } from "../../services/api";
import { Feather } from "@expo/vector-icons";

interface CitizenHomeScreenProps {
  onReportCreated: (report: any) => void;
  onNavigateToReports: () => void;
  currentLocation?: GeoPoint;
}

export const CitizenHomeScreen: React.FC<CitizenHomeScreenProps> = ({
  onReportCreated,
  onNavigateToReports,
  currentLocation,
}) => {
  const [wizardVisible, setWizardVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<IncidentCategory>("fire_smoke");
  const [sosSending, setSosSending] = useState(false);

  const handleOpenWizard = (category: IncidentCategory) => {
    setSelectedCategory(category);
    setWizardVisible(true);
  };

  const handleSOSTriggered = async () => {
    if (sosSending) return;
    setSosSending(true);

    try {
      const liveCoords = currentLocation || { lat: 23.2599, lng: 77.4126 };
      const sosResult = await mobileApi.triggerSOS(liveCoords);
      onReportCreated(sosResult);
      Alert.alert(
        "🚨 SOS SIGNAL BROADCASTED",
        "Your emergency beacon and live location have been instantly transmitted to Bhopal Emergency Dispatch, Responders, and your 3 Trusted Contacts.",
        [
          { text: "View My Report Status", onPress: onNavigateToReports },
          { text: "Dismiss", style: "cancel" },
        ]
      );
    } catch (e) {
      console.warn("Failed to trigger SOS on backend:", e);
      Alert.alert(
        "🚨 CONNECTION NOTICE",
        "Could not transmit emergency SOS beacon to the live backend. Please ensure your device is connected to the internet and tap Retry, or dial emergency services (112).",
        [
          { text: "Retry", onPress: handleSOSTriggered },
          { text: "Cancel", style: "cancel" },
        ]
      );
    } finally {
      setSosSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Campus Pilot Grid Status Strip */}
        <View style={styles.gridStatusStrip}>
          <View style={styles.statusPill}>
            <View style={styles.pulseGreenDot} />
            <Text style={styles.statusPillText}>Bhopal Safety Grid · Live</Text>
          </View>
          <Text style={styles.geofenceText}>Bhopal Geofenced</Text>
        </View>

        {/* Animated Concentric SOS Push Radar */}
        <SOSRadarButton onSOSTriggered={handleSOSTriggered} />

        {/* Live Campus Map Overview */}
        <View style={styles.mapSectionHeader}>
          <Text style={styles.sectionHeading}>Bhopal Tactical Overview</Text>
          <View style={styles.safeZoneBadge}>
            <Feather name="shield" size={12} color="#059669" />
            <Text style={styles.safeZoneText}>All Response Sectors Active</Text>
          </View>
        </View>

        <View style={styles.mapCard}>
          <TacticalCampusMap
            height={220}
            selfPoint={currentLocation || { lat: 23.2599, lng: 77.4126 }}
            interactive={true}
          />
        </View>

        {/* Section Heading */}
        <Text style={styles.sectionHeading}>Report incident</Text>

        {/* 2x3 Grid of Incident Categories */}
        <View style={styles.gridRow}>
          <CategoryCard
            category="fire_smoke"
            title="Fire & Smoke"
            onPress={() => handleOpenWizard("fire_smoke")}
          />
          <View style={{ width: 12 }} />
          <CategoryCard
            category="road_accident"
            title="Road Accident"
            onPress={() => handleOpenWizard("road_accident")}
          />
        </View>

        <View style={styles.gridRow}>
          <CategoryCard
            category="water_flood"
            title="Flood / Water"
            onPress={() => handleOpenWizard("water_flood")}
          />
          <View style={{ width: 12 }} />
          <CategoryCard
            category="medical"
            title="Medical"
            onPress={() => handleOpenWizard("medical")}
          />
        </View>

        <View style={styles.gridRow}>
          <CategoryCard
            category="personal_sos"
            title="Personal SOS"
            onPress={() => handleOpenWizard("personal_sos")}
          />
          <View style={{ width: 12 }} />
          <CategoryCard
            category="hazard"
            title="Other Hazard"
            onPress={() => handleOpenWizard("hazard")}
          />
        </View>

        <View style={styles.footerNote}>
          <Text style={styles.footerText}>ResQAi Emergency Coordination Platform · Campus Pilot</Text>
        </View>
      </ScrollView>

      {/* Report Creation Wizard Modal */}
      <ReportWizardModal
        visible={wizardVisible}
        initialCategory={selectedCategory}
        onClose={() => setWizardVisible(false)}
        onSubmit={(rep) => {
          onReportCreated(rep);
          onNavigateToReports();
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  gridStatusStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pulseGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16A34A",
    marginRight: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#15803D",
  },
  geofenceText: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
  },
  mapSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 10,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  safeZoneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DCFCE7",
  },
  safeZoneText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#16A34A",
  },
  mapCard: {
    marginBottom: 16,
  },
  gridRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  footerNote: {
    alignItems: "center",
    marginTop: 12,
  },
  footerText: {
    fontSize: 11,
    color: "#94A3B8",
  },
});
