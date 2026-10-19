import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { COLORS, SHADOWS } from "../../theme";
import { RadarMapGrid } from "../../components/radar/RadarMapGrid";
import { NearbyAlert } from "../../types";
import { ReportWizardModal } from "../../components/modals/ReportWizardModal";

interface CitizenAlertsScreenProps {
  alerts: NearbyAlert[];
  onOpenReportWizard: () => void;
}

export const CitizenAlertsScreen: React.FC<CitizenAlertsScreenProps> = ({
  alerts,
  onOpenReportWizard,
}) => {
  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.pageTitle}>Nearby alerts</Text>

        {/* Dynamic Campus Street Grid with Pulsing Radar Hotspots */}
        <View style={styles.mapContainer}>
          <RadarMapGrid
            height={210}
            activeMarkerTitle="Active incident (400 m away)"
          />
        </View>

        {/* Nearby Alert Cards */}
        <View style={styles.alertsList}>
          {alerts.map((alert) => {
            const isActive = alert.status === "active";
            const isOnScene = alert.status === "responders_on_scene";

            return (
              <View key={alert.id} style={styles.alertCard}>
                <View
                  style={[
                    styles.accentBar,
                    {
                      backgroundColor: isActive
                        ? COLORS.sosPrimary
                        : isOnScene
                        ? COLORS.warning
                        : COLORS.brandBlue,
                    },
                  ]}
                />
                <View style={styles.cardContent}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.alertTitle}>{alert.title}</Text>
                    <Text style={styles.alertDistance}>{alert.distance}</Text>
                  </View>

                  <Text style={styles.alertLocation}>
                    {alert.locationLabel}
                  </Text>

                  <View style={styles.badgeRow}>
                    <View
                      style={[
                        styles.statusBadge,
                        isActive && styles.activeBadge,
                        isOnScene && styles.onSceneBadge,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          isActive && styles.activeBadgeText,
                          isOnScene && styles.onSceneBadgeText,
                        ]}
                      >
                        {alert.badgeText}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Floating Action Button "Report new incident" */}
      <View style={styles.footer}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onOpenReportWizard}
          style={styles.reportNewBtn}
        >
          <Text style={styles.reportNewBtnText}>Report new incident</Text>
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 90,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.textPrimary,
    letterSpacing: -0.4,
    marginBottom: 16,
  },
  mapContainer: {
    marginBottom: 16,
    borderRadius: 20,
    overflow: "hidden",
    ...SHADOWS.card,
  },
  alertsList: {
    gap: 12,
  },
  alertCard: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    ...SHADOWS.card,
  },
  accentBar: {
    width: 5,
  },
  cardContent: {
    flex: 1,
    padding: 14,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  alertDistance: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textMuted,
  },
  alertLocation: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 10,
    lineHeight: 18,
  },
  badgeRow: {
    flexDirection: "row",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceSubtle,
  },
  activeBadge: {
    backgroundColor: "#FFE4E6",
  },
  activeBadgeText: {
    color: COLORS.sosPrimary,
    fontSize: 11,
    fontWeight: "700",
  },
  onSceneBadge: {
    backgroundColor: "#FEF3C7",
  },
  onSceneBadgeText: {
    color: "#B45309",
    fontSize: 11,
    fontWeight: "700",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  footer: {
    position: "absolute",
    bottom: 12,
    left: 20,
    right: 20,
  },
  reportNewBtn: {
    backgroundColor: "#1E293B",
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
    ...SHADOWS.card,
  },
  reportNewBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
