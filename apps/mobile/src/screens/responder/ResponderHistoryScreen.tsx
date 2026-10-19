import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { COLORS, SHADOWS } from "../../theme";
import { ResponderJob } from "../../types";

interface ResponderHistoryScreenProps {
  todayJobsCount: number;
  avgArrivalMinutes: number;
  acceptanceRatePct: number;
  historyJobs: ResponderJob[];
}

export const ResponderHistoryScreen: React.FC<ResponderHistoryScreenProps> = ({
  todayJobsCount,
  avgArrivalMinutes,
  acceptanceRatePct,
  historyJobs,
}) => {
  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.pageTitle}>History</Text>

        {/* 3 KPI summary metrics from Reference Image 2 Screen 3 */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{todayJobsCount}</Text>
            <Text style={styles.kpiLabel}>Today</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{avgArrivalMinutes}m</Text>
            <Text style={styles.kpiLabel}>Avg arrival</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{acceptanceRatePct}%</Text>
            <Text style={styles.kpiLabel}>Accepted</Text>
          </View>
        </View>

        {/* List of Historical Jobs */}
        <View style={styles.historyList}>
          {historyJobs.map((job) => (
            <View key={job.id} style={styles.historyCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.jobTitle}>{job.title}</Text>
                <View style={styles.resolvedPill}>
                  <Text style={styles.resolvedPillText}>Resolved</Text>
                </View>
              </View>

              <Text style={styles.metaText}>
                {job.locationLabel} · {job.eta}
              </Text>
            </View>
          ))}
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
  kpiRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    ...SHADOWS.card,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  kpiLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  historyList: {
    gap: 12,
  },
  historyCard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    ...SHADOWS.card,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  jobTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  metaText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  resolvedPill: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  resolvedPillText: {
    color: "#059669",
    fontSize: 11,
    fontWeight: "700",
  },
});
