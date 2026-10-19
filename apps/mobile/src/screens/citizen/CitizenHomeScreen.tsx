import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Alert } from "react-native";
import { COLORS } from "../../theme";
import { SOSRadarButton } from "../../components/radar/SOSRadarButton";
import { CategoryCard } from "../../components/cards/CategoryCard";
import { ReportWizardModal } from "../../components/modals/ReportWizardModal";
import { IncidentCategory } from "../../types";

interface CitizenHomeScreenProps {
  onReportCreated: (report: any) => void;
  onNavigateToReports: () => void;
}

export const CitizenHomeScreen: React.FC<CitizenHomeScreenProps> = ({
  onReportCreated,
  onNavigateToReports,
}) => {
  const [wizardVisible, setWizardVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<IncidentCategory>("fire_smoke");

  const handleOpenWizard = (category: IncidentCategory) => {
    setSelectedCategory(category);
    setWizardVisible(true);
  };

  const handleSOSTriggered = () => {
    const sosReport = {
      category: "personal_sos" as IncidentCategory,
      title: "CRITICAL PERSONAL SOS",
      text: "Automatic emergency SOS signal broadcast with real-time GPS telemetry.",
      locationLabel: "Main Quadrangle · Coordinates Broadcasted",
      voiceTranscript: undefined,
    };
    onReportCreated(sosReport);

    Alert.alert(
      "🚨 SOS SIGNAL DISPATCHED",
      "Your emergency beacon and live location have been sent to Campus Security, Campus Medical Team, and your 3 Trusted Contacts.",
      [
        {
          text: "View My Report Status",
          onPress: onNavigateToReports,
        },
        { text: "Dismiss", style: "cancel" },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Animated Concentric SOS Push Radar */}
        <SOSRadarButton onSOSTriggered={handleSOSTriggered} />

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
    paddingBottom: 24,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginTop: 18,
    marginBottom: 12,
  },
  gridRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
});
