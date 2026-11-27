import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, SHADOWS } from "../../theme";
import { ResponderJob, GeoPoint } from "../../types";
import { TacticalCampusMap, MapIncidentMarker, MapResponderMarker } from "../../components/map/TacticalCampusMap";

interface ResponderFeedScreenProps {
  isOnDuty: boolean;
  onToggleDuty: (val: boolean) => void;
  featuredJob: ResponderJob | null;
  resolvedJobs: ResponderJob[];
  onAcceptJob: (job: ResponderJob) => void;
  onDeclineJob: (job: ResponderJob) => void;
  currentLocation?: GeoPoint;
  unitCode?: string;
  unitName?: string;
}

export const ResponderFeedScreen: React.FC<ResponderFeedScreenProps> = ({
  isOnDuty,
  onToggleDuty,
  featuredJob,
  resolvedJobs,
  onAcceptJob,
  onDeclineJob,
  currentLocation,
  unitCode = "F-2",
  unitName = "Unit F-2",
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState(88);

  // 90-second response window countdown
  useEffect(() => {
    if (!featuredJob || featuredJob.status !== "offered") return;
    setSecondsRemaining(88);
    const interval = setInterval(() => {
      setSecondsRemaining((s) => (s > 1 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [featuredJob?.id, featuredJob?.status]);

  // Construct tactical map incident markers
  const mapIncidents: MapIncidentMarker[] = [];
  if (featuredJob && featuredJob.location) {
    mapIncidents.push({
      id: featuredJob.id,
      title: featuredJob.title,
      category: featuredJob.category,
      urgency: featuredJob.urgency,
      lat: featuredJob.location.lat,
      lng: featuredJob.location.lng,
      locationLabel: featuredJob.locationLabel,
      distanceLabel: featuredJob.distance,
      tone: "active",
    });
  } else if (featuredJob) {
    mapIncidents.push({
      id: featuredJob.id,
      title: featuredJob.title,
      category: featuredJob.category,
      urgency: featuredJob.urgency,
      lat: 23.2625,
      lng: 77.4140,
      locationLabel: featuredJob.locationLabel,
      distanceLabel: featuredJob.distance,
      tone: "active",
    });
  }

  const mapResponders: MapResponderMarker[] = [
    {
      id: `resp-${unitCode.toLowerCase()}`,
      unitCode,
      displayName: unitName,
      lat: currentLocation?.lat ?? 23.2599,
      lng: currentLocation?.lng ?? 77.4126,
      isOnDuty,
    },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* On Duty Header Toggle */}
        <View style={styles.dutyCard}>
          <View style={styles.dutyInfo}>
            <View style={styles.dutyTitleRow}>
              <View style={[styles.dutyStatusDot, { backgroundColor: isOnDuty ? "#10B981" : "#94A3B8" }]} />
              <Text style={styles.dutyTitle}>Responder Duty State</Text>
            </View>
            <Text style={styles.dutySubtitle}>
              {isOnDuty
                ? "Broadcasting GPS telemetry to campus dispatch"
                : "Off duty · No automatic dispatch calls assigned"}
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
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Live Responder Tactical Proximity Map */}
        <View style={styles.mapSectionHeader}>
          <Text style={styles.sectionTitle}>Field Tactical Proximity</Text>
          <View style={styles.gpsPill}>
            <Feather name="navigation" size={12} color="#0284C7" />
            <Text style={styles.gpsPillText}>Telemetry Active</Text>
          </View>
        </View>

        <View style={styles.mapContainer}>
          <TacticalCampusMap
            height={220}
            selfPoint={currentLocation || { lat: 23.2599, lng: 77.4126 }}
            incidents={mapIncidents}
            responders={mapResponders}
            showRoute={Boolean(featuredJob)}
            targetIncident={mapIncidents[0] || null}
          />
        </View>

        <Text style={styles.sectionTitle}>Awaiting response</Text>

        {/* Featured Job Card */}
        {featuredJob && featuredJob.status === "offered" ? (
          <View style={styles.featuredCard}>
            <View style={styles.featuredHeader}>
              <View style={styles.featuredBadge}>
                <Text style={styles.featuredBadgeText}>DISPATCH OFFER</Text>
              </View>
              <View style={styles.countdownBadge}>
                <Feather name="clock" size={12} color="#E11D48" />
                <Text style={styles.countdownText}>{secondsRemaining}s to respond</Text>
              </View>
            </View>

            <Text style={styles.jobTitle}>{featuredJob.title}</Text>
            <Text style={styles.jobLocation}>{featuredJob.locationLabel}</Text>

            {/* Chips row: URGENCY | distance | ETA */}
            <View style={styles.chipsRow}>
              <View style={[styles.chip, styles.chipUrgent]}>
                <Text style={styles.chipUrgentText}>{featuredJob.urgency.toUpperCase()}</Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipText}>{featuredJob.distance}</Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipText}>ETA ~ {featuredJob.eta}</Text>
              </View>
            </View>

            {featuredJob.aiSummary && (
              <View style={styles.aiTriageBox}>
                <Text style={styles.aiTriageLabel}>AI TRIAGE ASSESSMENT</Text>
                <Text style={styles.aiTriageText}>{featuredJob.aiSummary}</Text>
              </View>
            )}

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
                <Text style={styles.acceptBtnText}>Accept Mission</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : featuredJob && (featuredJob.status === "accepted" || featuredJob.status === "en_route" || featuredJob.status === "arrived") ? (
          <View style={styles.activeMissionCard}>
            <View style={styles.activeMissionHeader}>
              <View style={styles.activePill}>
                <Text style={styles.activePillText}>ACTIVE EN ROUTE MISSION</Text>
              </View>
              <Text style={styles.activeEtaText}>{featuredJob.eta}</Text>
            </View>
            <Text style={styles.activeTitle}>{featuredJob.title}</Text>
            <Text style={styles.activeLocation}>{featuredJob.locationLabel}</Text>
            <Text style={styles.activeHint}>Switch to Active Navigation tab for live walkway routing.</Text>
          </View>
        ) : (
          <View style={styles.noJobCard}>
            <Feather name="shield" size={28} color="#94A3B8" />
            <Text style={styles.noJobTitle}>No Active Dispatch Offers</Text>
            <Text style={styles.noJobSub}>
              {isOnDuty
                ? "Standing by on campus grid. You will be notified when an emergency occurs near your patrol zone."
                : "You are currently marked off-duty. Toggle switch above to receive dispatch offers."}
            </Text>
          </View>
        )}

        {/* Resolved / Past Jobs */}
        <Text style={[styles.sectionTitle, { marginTop: 22 }]}>
          Completed missions
        </Text>

        <View style={styles.resolvedList}>
          {resolvedJobs.length > 0 ? (
            resolvedJobs.slice(0, 4).map((job) => (
              <View key={job.id} style={styles.resolvedCard}>
                <View style={styles.resolvedInfo}>
                  <Text style={styles.resolvedTitle}>{job.title}</Text>
                  <Text style={styles.resolvedMeta}>
                    {job.locationLabel} · {job.distance}
                  </Text>
                </View>
                <View style={styles.resolvedBadge}>
                  <Text style={styles.resolvedBadgeText}>COMPLETED</Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyPastJobs}>
              <Text style={styles.emptyPastText}>No past missions completed in this session.</Text>
            </View>
          )}
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
  },
  dutyCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 16,
    marginBottom: 14,
    ...SHADOWS.card,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  dutyInfo: {
    flex: 1,
    marginRight: 12,
  },
  dutyTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dutyStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  dutyTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  dutySubtitle: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  dutyToggleRow: {
    alignItems: "center",
  },
  dutyStatusText: {
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 4,
  },
  mapSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  gpsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  gpsPillText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#0284C7",
  },
  mapContainer: {
    marginBottom: 16,
  },
  featuredCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: COLORS.sosPrimary,
    ...SHADOWS.cardHover,
  },
  featuredHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  featuredBadge: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  featuredBadgeText: {
    color: "#E11D48",
    fontSize: 10,
    fontWeight: "800",
  },
  countdownBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFF1F2",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  countdownText: {
    color: "#E11D48",
    fontSize: 11,
    fontWeight: "700",
  },
  jobTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  jobLocation: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    marginBottom: 12,
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  chipUrgent: {
    backgroundColor: "#FEE2E2",
  },
  chipUrgentText: {
    color: "#B91C1C",
    fontSize: 10,
    fontWeight: "800",
  },
  chipText: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "600",
  },
  aiTriageBox: {
    backgroundColor: "#F8FAFC",
    padding: 10,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  aiTriageLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#64748B",
    marginBottom: 2,
  },
  aiTriageText: {
    fontSize: 11,
    color: "#334155",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  declineBtn: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  declineBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  acceptBtn: {
    flex: 2,
    backgroundColor: COLORS.dutyPrimary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  acceptBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  activeMissionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#0284C7",
    ...SHADOWS.card,
  },
  activeMissionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  activePill: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activePillText: {
    color: "#0284C7",
    fontSize: 10,
    fontWeight: "800",
  },
  activeEtaText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0284C7",
  },
  activeTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  activeLocation: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  activeHint: {
    fontSize: 11,
    color: "#0284C7",
    marginTop: 8,
    fontWeight: "500",
  },
  noJobCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  noJobTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 8,
  },
  noJobSub: {
    fontSize: 11,
    color: "#64748B",
    textAlign: "center",
    marginTop: 4,
    paddingHorizontal: 12,
  },
  resolvedList: {
    gap: 8,
    marginTop: 8,
  },
  resolvedCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  resolvedInfo: {
    flex: 1,
  },
  resolvedTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  resolvedMeta: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  resolvedBadge: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  resolvedBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#059669",
  },
  emptyPastJobs: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    alignItems: "center",
  },
  emptyPastText: {
    fontSize: 12,
    color: "#94A3B8",
  },
});
