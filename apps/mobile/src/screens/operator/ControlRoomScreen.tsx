import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { COLORS, SHADOWS } from "../../theme";
import { RadarMapGrid } from "../../components/radar/RadarMapGrid";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";

interface ControlRoomScreenProps {
  onVerifyAndDispatch: () => void;
}

export const ControlRoomScreen: React.FC<ControlRoomScreenProps> = ({
  onVerifyAndDispatch,
}) => {
  const [selectedIncident, setSelectedIncident] = useState("402");
  const [dispatched, setDispatched] = useState(false);

  // Incidents will be populated via API
  const incidents: {
    id: string;
    title: string;
    location: string;
    severity: string;
    severityBg: string;
    severityColor: string;
  }[] = [];

  const handleDispatch = () => {
    setDispatched(true);
    onVerifyAndDispatch();
    Alert.alert(
      "🚀 Offer Dispatched to Responders",
      "Unit F-2 (Fire Brigade) has been notified. 90-second acknowledgement timer active."
    );
  };

  const handleFalseAlarm = () => {
    Alert.alert(
      "Document False Alarm Review",
      "Opening operator documented false/malicious report audit review."
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Live Dashboard</Text>
          <View style={styles.liveTag}>
            <Text style={styles.liveTagText}>Command center: Live</Text>
          </View>
        </View>

        {/* 4 KPI Metrics Row */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Average response</Text>
            <Text style={styles.kpiVal}>—</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>False alarm rate</Text>
            <Text style={styles.kpiVal}>—</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Active responders</Text>
            <Text style={styles.kpiVal}>0</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Unverified reports</Text>
            <Text style={styles.kpiVal}>0</Text>
          </View>
        </View>

        {/* Map View */}
        <View style={styles.mapSection}>
          <RadarMapGrid
            height={200}
            showRoute={true}
            activeMarkerTitle="Incident 402 (Active Dispatch)"
          />
        </View>

        {/* Active Incidents Selector */}
        <Text style={styles.sectionHeading}>Active Incidents</Text>
        <View style={styles.incidentList}>
          {incidents.map((inc) => {
            const isSelected = selectedIncident === inc.id;
            return (
              <TouchableOpacity
                key={inc.id}
                onPress={() => setSelectedIncident(inc.id)}
                style={[
                  styles.incidentCard,
                  isSelected && styles.incidentCardSelected,
                ]}
              >
                <View
                  style={[
                    styles.severityPill,
                    { backgroundColor: inc.severityBg },
                  ]}
                >
                  <Text
                    style={[
                      styles.severityText,
                      { color: inc.severityColor },
                    ]}
                  >
                    {inc.severity}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.incTitle}>{inc.title}</Text>
                  <Text style={styles.incLoc}>{inc.location}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Triage and AI Support Panel */}
        <Text style={[styles.sectionHeading, { marginTop: 20 }]}>
          Triage and AI Support
        </Text>
        <View style={styles.triageCard}>
          {/* Placeholder — will show real AI analysis */}
          <View style={styles.aiResultRow}>
            <MaterialCommunityIcons
              name="information-outline"
              size={22}
              color={COLORS.textMuted}
            />
            <Text style={[styles.aiResultText, { color: COLORS.textMuted }]}>
              Select an incident to see AI triage
            </Text>
          </View>

          {/* Buttons */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleDispatch}
            style={[styles.dispatchBtn, dispatched && styles.dispatchBtnDone]}
          >
            <Text style={styles.dispatchBtnText}>
              {dispatched ? "✓ OFFER DISPATCHED" : "VERIFY & DISPATCH"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleFalseAlarm}
            style={styles.falseAlarmBtn}
          >
            <Text style={styles.falseAlarmBtnText}>MARK FALSE ALARM</Text>
          </TouchableOpacity>
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
    paddingTop: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  liveTag: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveTagText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#059669",
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  kpiBox: {
    flex: 1,
    minWidth: "46%",
    backgroundColor: COLORS.surface,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    ...SHADOWS.card,
  },
  kpiLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  kpiVal: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  mapSection: {
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 16,
    ...SHADOWS.card,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
  incidentList: {
    gap: 8,
  },
  incidentCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  incidentCardSelected: {
    borderColor: "#E11D48",
    backgroundColor: "#FFF5F5",
  },
  severityPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  severityText: {
    fontSize: 10,
    fontWeight: "800",
  },
  incTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  incLoc: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  triageCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    ...SHADOWS.card,
  },
  aiResultRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  aiResultText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#E11D48",
  },
  transcriptBox: {
    backgroundColor: "#F8FAFC",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  transcriptLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  transcriptQuote: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textPrimary,
    fontStyle: "italic",
    marginTop: 2,
  },
  suggestionBox: {
    backgroundColor: "#FEF2F2",
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  suggestionText: {
    fontSize: 12,
    color: "#B91C1C",
    lineHeight: 16,
  },
  recTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  responderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  responderName: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  responderEta: {
    fontSize: 13,
    fontWeight: "700",
    color: "#059669",
  },
  dispatchBtn: {
    backgroundColor: "#059669",
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 14,
  },
  dispatchBtnDone: {
    backgroundColor: "#10B981",
  },
  dispatchBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  falseAlarmBtn: {
    borderWidth: 1,
    borderColor: "#EF4444",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  falseAlarmBtnText: {
    color: "#EF4444",
    fontSize: 13,
    fontWeight: "700",
  },
});
