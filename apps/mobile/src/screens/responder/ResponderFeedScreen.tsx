import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from "react-native";
import { COLORS, SHADOWS } from "../../theme";
import { ResponderJob } from "../../types";

interface ResponderFeedScreenProps {
  isOnDuty: boolean;
  onToggleDuty: (val: boolean) => void;
  featuredJob: ResponderJob | null;
  resolvedJobs: ResponderJob[];
  onAcceptJob: (job: ResponderJob) => void;
  onDeclineJob: (job: ResponderJob) => void;
}

export const ResponderFeedScreen: React.FC<ResponderFeedScreenProps> = ({
  isOnDuty,
  onToggleDuty,
  featuredJob,
  resolvedJobs,
  onAcceptJob,
  onDeclineJob,
}) => {
  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* On Duty Header Toggle */}
        <View style={styles.dutyCard}>
          <View>
            <Text style={styles.dutyTitle}>Responder Duty Mode</Text>
            <Text style={styles.dutySubtitle}>
              {isOnDuty ? "Broadcasting telemetry to dispatch" : "Off duty - no dispatch calls"}
            </Text>
          </View>
          <View style={styles.dutyToggleRow}>
            <Text
              style={[
                styles.dutyStatusText,
                { color: isOnDuty ? COLORS.dutyPrimary : COLORS.textMuted },
              ]}
            >
              {isOnDuty ? "ON DUTY" : "OFF"}
            </Text>
            <Switch
              value={isOnDuty}
              onValueChange={onToggleDuty}
              trackColor={{ false: "#CBD5E1", true: "#10B981" }}
              thumbColor={"#FFFFFF"}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Awaiting response</Text>

        {/* Featured Job Card (From Reference Image 2 Screen 1) */}
        {featuredJob && featuredJob.status === "offered" ? (
          <View style={styles.featuredCard}>
            <View style={styles.featuredBadge}>
              <Text style={styles.featuredBadgeText}>FEATURED JOB</Text>
            </View>

            <Text style={styles.jobTitle}>{featuredJob.title}</Text>
            <Text style={styles.jobLocation}>{featuredJob.locationLabel}</Text>

            {/* Chips row: HIGH | 1.2 km | Est. 5 min */}
            <View style={styles.chipsRow}>
              <View style={[styles.chip, styles.chipUrgent]}>
                <Text style={styles.chipUrgentText}>HIGH</Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipText}>{featuredJob.distance}</Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipText}>{featuredJob.eta}</Text>
              </View>
            </View>

            {/* Buttons: Decline | Accept */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => onDeclineJob(featuredJob)}
                style={styles.declineBtn}
              >
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => onAcceptJob(featuredJob)}
                style={styles.acceptBtn}
              >
                <Text style={styles.acceptBtnText}>ACCEPT</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No open offers right now.</Text>
            <Text style={styles.emptySub}>All reported incidents are assigned or resolved.</Text>
          </View>
        )}

        {/* Past Resolved Incidents */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
          Recent logs
        </Text>
        <View style={styles.resolvedList}>
          {resolvedJobs.map((job) => (
            <View key={job.id} style={styles.resolvedCard}>
              <View style={styles.resolvedInfo}>
                <Text style={styles.resolvedTitle}>{job.title}</Text>
                <Text style={styles.resolvedLocation}>
                  {job.locationLabel} · {job.timeAgo}
                </Text>
              </View>
              <View style={styles.resolvedPill}>
                <Text style={styles.resolvedPillText}>Resolved</Text>
              </View>
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
    paddingTop: 14,
    paddingBottom: 40,
  },
  dutyCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.surface,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    marginBottom: 20,
    ...SHADOWS.card,
  },
  dutyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  dutySubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  dutyToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dutyStatusText: {
    fontSize: 12,
    fontWeight: "800",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.textPrimary,
    letterSpacing: -0.4,
    marginBottom: 14,
  },
  featuredCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: "#FCD34D",
    ...SHADOWS.cardHover,
  },
  featuredBadge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  featuredBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#B45309",
    letterSpacing: 0.5,
  },
  jobTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  jobLocation: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
    marginBottom: 14,
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 18,
  },
  chip: {
    backgroundColor: COLORS.surfaceSubtle,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  chipUrgent: {
    backgroundColor: "#FEE2E2",
  },
  chipUrgentText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#DC2626",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  declineBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  declineBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  acceptBtn: {
    flex: 1.5,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#059669",
    alignItems: "center",
    ...SHADOWS.card,
  },
  acceptBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    padding: 24,
    borderRadius: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  emptySub: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  resolvedList: {
    gap: 10,
  },
  resolvedCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.surface,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    ...SHADOWS.card,
  },
  resolvedInfo: {
    flex: 1,
  },
  resolvedTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  resolvedLocation: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
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
