import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS, SHADOWS } from "../../theme";
import { ResponderJob } from "../../types";

interface ResponderHistoryScreenProps {
  todayJobsCount: number;
  avgArrivalMinutes: number;
  acceptanceRatePct: number;
  historyJobs: ResponderJob[];
  onRefresh?: () => void;
}

export const ResponderHistoryScreen: React.FC<ResponderHistoryScreenProps> = ({
  todayJobsCount,
  avgArrivalMinutes,
  acceptanceRatePct,
  historyJobs,
  onRefresh,
}) => {
  const [selectedJob, setSelectedJob] = useState<ResponderJob | null>(null);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>Mission History</Text>
          {onRefresh && (
            <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
              <Feather name="refresh-cw" size={14} color="#0F172A" />
            </TouchableOpacity>
          )}
        </View>

        {/* 3 KPI Summary Metrics */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{todayJobsCount}</Text>
            <Text style={styles.kpiLabel}>Today</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{avgArrivalMinutes.toFixed(1)}m</Text>
            <Text style={styles.kpiLabel}>Avg arrival</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{acceptanceRatePct}%</Text>
            <Text style={styles.kpiLabel}>Accepted</Text>
          </View>
        </View>

        {/* List of Historical Jobs */}
        <Text style={styles.sectionHeading}>Resolved Missions</Text>

        <View style={styles.historyList}>
          {historyJobs.length > 0 ? (
            historyJobs.map((job) => (
              <TouchableOpacity
                key={job.id}
                activeOpacity={0.8}
                style={styles.historyCard}
                onPress={() => setSelectedJob(job)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.jobTitle} numberOfLines={1}>
                    {job.title}
                  </Text>
                  <View style={styles.resolvedPill}>
                    <Text style={styles.resolvedPillText}>Resolved</Text>
                  </View>
                </View>

                <Text style={styles.metaText}>
                  {job.locationLabel} · {job.distance || "0.8 km"}
                </Text>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <Feather name="check-circle" size={36} color="#10B981" />
              <Text style={styles.emptyTitle}>No Completed Missions Yet</Text>
              <Text style={styles.emptySub}>
                When Unit F-2 responds to an emergency offer and completes the mission on scene, the mission briefing and outcome will be archived here.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Mission Inspection Modal */}
      {selectedJob && (
        <Modal visible={Boolean(selectedJob)} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {selectedJob.title}
                </Text>
                <TouchableOpacity onPress={() => setSelectedJob(null)}>
                  <Feather name="x" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBadgeRow}>
                <View style={styles.resolvedPill}>
                  <Text style={styles.resolvedPillText}>RESOLVED ON SCENE</Text>
                </View>
                <Text style={styles.modalTime}>{selectedJob.timeAgo || "Completed"}</Text>
              </View>

              <Text style={styles.detailLabel}>Location</Text>
              <Text style={styles.detailText}>{selectedJob.locationLabel}</Text>

              <Text style={styles.detailLabel}>Responding Unit</Text>
              <Text style={styles.detailText}>Fire Unit F-2 · Northridge Central Post</Text>

              <Text style={styles.detailLabel}>Mission Outcome</Text>
              <Text style={styles.detailText}>
                {selectedJob.aiSummary || "Emergency secured. Area cleared by responding unit."}
              </Text>

              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setSelectedJob(null)}
              >
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    ...SHADOWS.card,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  kpiRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...SHADOWS.card,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  kpiLabel: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
    fontWeight: "500",
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
  historyList: {
    gap: 10,
  },
  historyCard: {
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...SHADOWS.card,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  jobTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  resolvedPill: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  resolvedPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#15803D",
  },
  metaText: {
    fontSize: 12,
    color: "#64748B",
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    ...SHADOWS.cardHover,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    flex: 1,
    marginRight: 10,
  },
  modalBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  modalTime: {
    fontSize: 11,
    color: "#64748B",
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 2,
  },
  detailText: {
    fontSize: 13,
    color: "#1E293B",
    lineHeight: 18,
  },
  modalCloseBtn: {
    backgroundColor: "#0F172A",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 18,
  },
  modalCloseText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
