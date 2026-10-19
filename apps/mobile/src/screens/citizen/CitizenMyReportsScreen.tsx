import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { COLORS, SHADOWS } from "../../theme";
import { CitizenReport } from "../../types";

interface CitizenMyReportsScreenProps {
  reports: CitizenReport[];
}

export const CitizenMyReportsScreen: React.FC<CitizenMyReportsScreenProps> = ({
  reports,
}) => {
  const getBadgeStyle = (status: string) => {
    switch (status) {
      case "dispatched":
        return {
          bg: "#FEF3C7",
          text: "#D97706",
          label: "Dispatched",
        };
      case "resolved":
        return {
          bg: "#ECFDF5",
          text: "#059669",
          label: "Resolved",
        };
      case "in_review":
      default:
        return {
          bg: "#FEF9C3",
          text: "#CA8A04",
          label: "In review",
        };
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.pageTitle}>My reports</Text>

        <View style={styles.reportsList}>
          {reports.map((report) => {
            const badge = getBadgeStyle(report.status);
            const hasStepper = report.currentStep && report.currentStep < 4;

            return (
              <View key={report.id} style={styles.reportCard}>
                <View style={styles.headerRow}>
                  <Text style={styles.reportTitle}>{report.title}</Text>
                  <View
                    style={[styles.statusBadge, { backgroundColor: badge.bg }]}
                  >
                    <Text
                      style={[styles.badgeText, { color: badge.text }]}
                    >
                      {report.statusLabel || badge.label}
                    </Text>
                  </View>
                </View>

                <Text style={styles.timestamp}>{report.timestamp}</Text>

                {/* 4-Step Progress Stepper Bar if active */}
                {hasStepper ? (
                  <View style={styles.stepperContainer}>
                    <View style={styles.stepperSegments}>
                      <View
                        style={[
                          styles.segment,
                          report.currentStep >= 1 && styles.segmentActive,
                        ]}
                      />
                      <View
                        style={[
                          styles.segment,
                          report.currentStep >= 2 && styles.segmentActive,
                        ]}
                      />
                      <View
                        style={[
                          styles.segment,
                          report.currentStep >= 3 && styles.segmentActive,
                        ]}
                      />
                      <View
                        style={[
                          styles.segment,
                          report.currentStep >= 4 && styles.segmentActive,
                        ]}
                      />
                    </View>
                    {report.stepDetails ? (
                      <Text style={styles.stepDetails}>
                        {report.stepDetails}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
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
    paddingBottom: 40,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.textPrimary,
    letterSpacing: -0.4,
    marginBottom: 16,
  },
  reportsList: {
    gap: 12,
  },
  reportCard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    ...SHADOWS.card,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  timestamp: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 3,
    marginBottom: 10,
  },
  stepperContainer: {
    marginTop: 4,
  },
  stepperSegments: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
  },
  segmentActive: {
    backgroundColor: "#10B981", // Emerald green progress
  },
  stepDetails: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
});
