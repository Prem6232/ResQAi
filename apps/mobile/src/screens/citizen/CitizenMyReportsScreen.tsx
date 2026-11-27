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
import { CitizenReport } from "../../types";

interface CitizenMyReportsScreenProps {
  reports: CitizenReport[];
  onRefresh?: () => void;
  onOpenReportWizard?: () => void;
}

export const CitizenMyReportsScreen: React.FC<CitizenMyReportsScreenProps> = ({
  reports,
  onRefresh,
  onOpenReportWizard,
}) => {
  const [selectedReport, setSelectedReport] = useState<CitizenReport | null>(null);

  const formatStatus = (rawStatus: string, label?: string) => {
    if (rawStatus === "false_alarm" || rawStatus === "cancelled") return "Cancelled";
    const text = label || rawStatus;
    if (text === "received_by_server") return "Received";
    if (text === "in_review" || text === "triaged") return "In Review";
    if (text === "verified" || text === "dispatched") return "Dispatched";
    if (text === "resolved" || text === "delivered") return "Resolved";
    return text.replace(/_/g, " ");
  };

  const getBadgeStyle = (status: string) => {
    switch (status) {
      case "false_alarm":
        return {
          bg: "#F1F5F9",
          text: "#475569",
        };
      case "dispatched":
      case "verified":
        return {
          bg: "#DBEAFE",
          text: "#1D4ED8",
        };
      case "resolved":
      case "delivered":
        return {
          bg: "#ECFDF5",
          text: "#059669",
        };
      case "in_review":
      case "received_by_server":
      default:
        return {
          bg: "#FEF9C3",
          text: "#A16207",
        };
    }
  };

  const stepLabels = [
    "1. Submitted & Logged",
    "2. AI Triage & Assessment",
    "3. First Responders Dispatched",
    "4. Resolved & Scene Secured",
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>My reports</Text>
          {onRefresh && (
            <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
              <Feather name="refresh-cw" size={14} color="#0F172A" />
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.pageSub}>
          Live tracking of your emergency transmissions and incident reports.
        </Text>

        <View style={styles.reportsList}>
          {reports.length > 0 ? (
            reports.map((report) => {
              const badge = getBadgeStyle(report.status);
              const formattedStatus = formatStatus(report.status, report.statusLabel);
              const step = report.currentStep || 2;

              return (
                <TouchableOpacity
                  key={report.id}
                  activeOpacity={0.8}
                  style={styles.reportCard}
                  onPress={() => setSelectedReport(report)}
                >
                  <View style={styles.headerRow}>
                    <Text style={styles.reportTitle} numberOfLines={1}>
                      {report.title}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.text }]} numberOfLines={1}>
                        {formattedStatus}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.timestamp}>
                    {report.timestamp} · {report.locationLabel || "Bhopal Metro"}
                  </Text>

                  {/* 4-Step Progress Stepper Bar */}
                  <View style={styles.stepperContainer}>
                    <View style={styles.stepperSegments}>
                      <View style={[styles.segment, step >= 1 && styles.segmentActive]} />
                      <View style={[styles.segment, step >= 2 && styles.segmentActive]} />
                      <View style={[styles.segment, step >= 3 && styles.segmentActive]} />
                      <View style={[styles.segment, step >= 4 && styles.segmentActive]} />
                    </View>
                    <Text style={styles.stepDetails}>
                      {stepLabels[Math.min(step - 1, 3)]}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={styles.emptyCard}>
              <Feather name="inbox" size={36} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No Reports Submitted</Text>
              <Text style={styles.emptySub}>
                When you submit an emergency beacon or hazard report, it will track here live.
              </Text>
              {onOpenReportWizard && (
                <TouchableOpacity style={styles.emptyActionBtn} onPress={onOpenReportWizard}>
                  <Text style={styles.emptyActionText}>Submit Incident Report</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Report Detail Modal */}
      {selectedReport && (
        <Modal visible={Boolean(selectedReport)} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {selectedReport.title}
                </Text>
                <TouchableOpacity onPress={() => setSelectedReport(null)}>
                  <Feather name="x" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalMetaRow}>
                <View style={[styles.statusBadge, { backgroundColor: getBadgeStyle(selectedReport.status).bg }]}>
                  <Text style={[styles.badgeText, { color: getBadgeStyle(selectedReport.status).text }]}>
                    {formatStatus(selectedReport.status, selectedReport.statusLabel)}
                  </Text>
                </View>
                <Text style={styles.modalTime}>{selectedReport.timestamp}</Text>
              </View>

              <Text style={styles.detailSectionTitle}>Incident Description</Text>
              <Text style={styles.detailText}>
                {selectedReport.stepDetails || selectedReport.title}
              </Text>

              <Text style={styles.detailSectionTitle}>Location Telemetry</Text>
              <Text style={styles.detailText}>
                {selectedReport.locationLabel}
                {selectedReport.location ? ` (${selectedReport.location.lat.toFixed(4)}, ${selectedReport.location.lng.toFixed(4)})` : ""}
              </Text>

              <Text style={styles.detailSectionTitle}>Lifecycle Tracking</Text>
              <View style={styles.timelineBox}>
                {stepLabels.map((sLabel, idx) => {
                  const isDone = (selectedReport.currentStep || 2) > idx;
                  const isCurrent = (selectedReport.currentStep || 2) === idx + 1;
                  return (
                    <View key={idx} style={styles.timelineRow}>
                      <View
                        style={[
                          styles.timelineCircle,
                          isDone && styles.timelineCircleDone,
                          isCurrent && styles.timelineCircleCurrent,
                        ]}
                      >
                        {isDone ? (
                          <Feather name="check" size={10} color="#FFFFFF" />
                        ) : (
                          <View
                            style={[
                              styles.timelineInnerDot,
                              isCurrent && { backgroundColor: "#0284C7" },
                            ]}
                          />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.timelineText,
                          (isDone || isCurrent) && styles.timelineTextActive,
                        ]}
                      >
                        {sLabel}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setSelectedReport(null)}
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
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  pageSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    marginBottom: 14,
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
  reportsList: {
    gap: 12,
  },
  reportCard: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...SHADOWS.card,
  },
  reportTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    maxWidth: 110,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  timestamp: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 4,
    marginBottom: 12,
  },
  stepperContainer: {
    marginTop: 4,
  },
  stepperSegments: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 6,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
  },
  segmentActive: {
    backgroundColor: "#10B981",
  },
  stepDetails: {
    fontSize: 11,
    color: "#475569",
    fontWeight: "500",
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
  emptyActionBtn: {
    backgroundColor: "#0F172A",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 16,
  },
  emptyActionText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
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
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    flex: 1,
    marginRight: 10,
  },
  modalMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    marginBottom: 14,
  },
  modalTime: {
    fontSize: 11,
    color: "#64748B",
  },
  detailSectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 3,
  },
  detailText: {
    fontSize: 13,
    color: "#1E293B",
    lineHeight: 18,
  },
  timelineBox: {
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 12,
    marginTop: 6,
    gap: 8,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  timelineCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  timelineCircleDone: {
    backgroundColor: "#10B981",
  },
  timelineCircleCurrent: {
    backgroundColor: "#DBEAFE",
    borderWidth: 1.5,
    borderColor: "#0284C7",
  },
  timelineInnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "transparent",
  },
  timelineText: {
    fontSize: 11,
    color: "#64748B",
  },
  timelineTextActive: {
    color: "#0F172A",
    fontWeight: "700",
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
