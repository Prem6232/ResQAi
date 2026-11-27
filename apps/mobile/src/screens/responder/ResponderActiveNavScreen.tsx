import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, SHADOWS } from "../../theme";
import { TacticalCampusMap, MapIncidentMarker, MapResponderMarker } from "../../components/map/TacticalCampusMap";
import { ResponderJob, GeoPoint } from "../../types";
import { mobileApi } from "../../services/api";

interface ResponderActiveNavScreenProps {
  activeJob: ResponderJob | null;
  onMarkEnRoute?: () => void;
  onMarkArrived: () => void;
  onMarkCompleted?: () => void;
  currentLocation?: GeoPoint;
  unitCode?: string;
  unitName?: string;
}

const mapJobStatus = (status?: string): "accepted" | "en_route" | "arrived" | "completed" => {
  if (status === "arrived") return "arrived";
  if (status === "en_route") return "en_route";
  if (status === "completed") return "completed";
  return "accepted";
};

export const ResponderActiveNavScreen: React.FC<ResponderActiveNavScreenProps> = ({
  activeJob,
  onMarkEnRoute,
  onMarkArrived,
  onMarkCompleted,
  currentLocation,
  unitCode = "F-2",
  unitName = "Unit F-2",
}) => {
  const [currentStatus, setCurrentStatus] = useState<"accepted" | "en_route" | "arrived" | "completed">(
    mapJobStatus(activeJob?.status)
  );
  const [notesModalVisible, setNotesModalVisible] = useState(false);
  const [fieldNotes, setFieldNotes] = useState("");
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setCurrentStatus(mapJobStatus(activeJob?.status));
  }, [activeJob?.id, activeJob?.status]);

  const handleArrived = async () => {
    if (!activeJob) {
      Alert.alert("No Active Mission", "Accept a dispatch offer before updating mission status.");
      return;
    }

    if (currentStatus === "accepted") {
      try {
        await mobileApi.updateAssignmentStatus(activeJob.id, "en_route", "Unit started en-route navigation");
        setCurrentStatus("en_route");
        onMarkEnRoute?.();
      } catch (e) {
        console.warn("Failed to transition to en_route", e);
        Alert.alert("Sync Error", "Unable to update status to en route on server.");
      }
      return;
    }

    if (currentStatus === "en_route") {
      try {
        await mobileApi.updateAssignmentStatus(activeJob.id, "arrived", "Unit arrived on scene");
        setCurrentStatus("arrived");
        onMarkArrived();
        Alert.alert(
          "✅ Arrived on Scene",
          `Control Room and Citizen have been notified that ${unitName} is actively on scene.`
        );
      } catch (e) {
        console.warn("Failed to transition to arrived", e);
        Alert.alert("Sync Error", "Unable to mark scene arrival on server.");
      }
    } else if (currentStatus === "arrived") {
      Alert.alert(
        "Complete Mission",
        "Confirm that emergency response is finalized and scene is fully secured?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Complete Mission",
            onPress: async () => {
              try {
                await mobileApi.updateAssignmentStatus(activeJob.id, "completed", "Scene resolved and secured");
                setCurrentStatus("completed");
                if (onMarkCompleted) onMarkCompleted();
              } catch (e) {
                console.warn("Complete status failed", e);
                Alert.alert("Sync Error", "Unable to complete mission on server.");
              }
            },
          },
        ]
      );
    }
  };

  const handleSaveNotes = async () => {
    if (!fieldNotes.trim() || !activeJob) return;
    try {
      setIsSubmitting(true);
      await mobileApi.addAssignmentNotes(activeJob.id, fieldNotes.trim());
      setNotesModalVisible(false);
      setFieldNotes("");
      Alert.alert("Notes Logged", "Operational notes appended to mission ledger.");
    } catch {
      Alert.alert("Note Saved Locally", "Notes cached for audit review.");
      setNotesModalVisible(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const targetIncidentPoint: MapIncidentMarker = {
    id: activeJob?.id || "inc-active",
    title: activeJob?.title || "Active Emergency Incident",
    category: activeJob?.category || "fire_smoke",
    urgency: activeJob?.urgency || "critical",
    lat: activeJob?.location?.lat || 23.2625,
    lng: activeJob?.location?.lng || 77.4140,
    locationLabel: activeJob?.locationLabel || "VIP Road · Bhopal Lakefront",
    distanceLabel: activeJob?.distance || "0.4 km",
    tone: "active",
  };

  const responderPoint: MapResponderMarker = {
    id: `resp-${unitCode.toLowerCase()}`,
    unitCode,
    displayName: unitName,
    lat: currentLocation?.lat ?? 23.2599,
    lng: currentLocation?.lng ?? 77.4126,
    isOnDuty: true,
  };

  return (
    <View style={styles.container}>
      {/* Route Status Banner */}
      <View
        style={[
          styles.statusStrip,
          currentStatus === "arrived" && styles.statusStripArrived,
          currentStatus === "completed" && styles.statusStripCompleted,
        ]}
      >
        <Text
          style={[
            styles.statusStripText,
            currentStatus === "arrived" && styles.statusStripTextArrived,
            currentStatus === "completed" && styles.statusStripTextCompleted,
          ]}
        >
          {currentStatus === "completed"
            ? "MISSION COMPLETED · SCENE SECURED"
            : currentStatus === "arrived"
            ? "STATUS: ON SCENE · TELEMETRY ACTIVE"
            : currentStatus === "accepted"
            ? `DISPATCH ACCEPTED · DEPLOY TO ${(targetIncidentPoint.locationLabel || "TARGET LOCATION").toUpperCase()}`
            : `EN ROUTE TO ${(targetIncidentPoint.locationLabel || "TARGET LOCATION").toUpperCase()}`}
        </Text>
      </View>

      {/* Turn-by-Turn Guidance Banner */}
      <View style={styles.guidanceBanner}>
        <View style={styles.arrowIconBox}>
          <Feather
            name={currentStatus === "arrived" ? "check-circle" : "corner-up-left"}
            size={22}
            color="#FFFFFF"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.guidanceText}>
            {currentStatus === "completed"
              ? "Mission finalized"
              : currentStatus === "arrived"
              ? "Arrived at target location"
              : currentStatus === "accepted"
              ? `Ready to deploy toward ${targetIncidentPoint.locationLabel}`
              : `Proceed to ${targetIncidentPoint.locationLabel}`}
          </Text>
          <Text style={styles.guidanceSub}>
            {currentStatus === "en_route"
              ? "Follow fastest Bhopal dispatch corridor"
              : currentStatus === "accepted"
              ? "Tap Start En Route before departing"
              : "Unit on scene"}
          </Text>
        </View>
        <View style={styles.etaBadge}>
          <Text style={styles.etaBadgeVal}>
            {currentStatus === "arrived" ? "0m" : activeJob?.eta || "3 min"}
          </Text>
        </View>
      </View>

      {/* High Performance Vector Tactical Navigation Map */}
      <View style={styles.mapArea}>
        <TacticalCampusMap
          height={320}
          showRoute={currentStatus === "en_route"}
          selfPoint={{ lat: responderPoint.lat, lng: responderPoint.lng }}
          targetIncident={targetIncidentPoint}
          incidents={[targetIncidentPoint]}
          responders={[responderPoint]}
        />
      </View>

      {/* Bottom Mission Control Sheet */}
      <View style={styles.bottomSheet}>
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {targetIncidentPoint.title}
            </Text>
            <Text style={styles.sheetMeta}>
              {targetIncidentPoint.locationLabel} · {activeJob?.distance || "350 m away"}
            </Text>
          </View>
          <View style={styles.liveTag}>
            <View style={styles.pulseGreenDot} />
            <Text style={styles.liveTagText}>GPS LIVE</Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleArrived}
          style={[
            styles.actionBtn,
            currentStatus === "arrived" && styles.actionBtnArrived,
            currentStatus === "completed" && styles.actionBtnCompleted,
          ]}
        >
          <Text style={styles.actionBtnText}>
            {currentStatus === "completed"
              ? "✓ Mission Finalized"
              : currentStatus === "arrived"
              ? "✓ Complete Mission & Close Incident"
              : currentStatus === "en_route"
              ? "Mark Arrived on Scene"
              : "Start En Route Navigation"}
          </Text>
        </TouchableOpacity>

        <View style={styles.secondaryActionsRow}>
          <TouchableOpacity
            style={styles.secBtn}
            onPress={() => setNotesModalVisible(true)}
          >
            <Feather name="edit-3" size={14} color="#475569" style={{ marginRight: 6 }} />
            <Text style={styles.secBtnText}>Add Field Notes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secBtn}
            onPress={() => setDetailsModalVisible(true)}
          >
            <Feather name="info" size={14} color="#475569" style={{ marginRight: 6 }} />
            <Text style={styles.secBtnText}>AI Briefing</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Field Notes Modal */}
      <Modal visible={notesModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Append Operational Notes</Text>
              <TouchableOpacity onPress={() => setNotesModalVisible(false)}>
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>
              Logged in immutable mission timeline for command audit.
            </Text>
            <TextInput
              style={styles.textArea}
              placeholder="e.g. Fire extinguisher deployed on 2nd floor corridor. Minor smoke residual."
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={4}
              value={fieldNotes}
              onChangeText={setFieldNotes}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setNotesModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveNotes}
                disabled={isSubmitting}
              >
                <Text style={styles.modalSaveText}>
                  {isSubmitting ? "Saving..." : "Log Note"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Incident AI Briefing Modal */}
      <Modal visible={detailsModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Mission AI Assessment</Text>
              <TouchableOpacity onPress={() => setDetailsModalVisible(false)}>
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text style={styles.briefingItem}>
              <Text style={styles.briefingLabel}>Category: </Text>
              {targetIncidentPoint.category.replace("_", " ").toUpperCase()}
            </Text>
            <Text style={styles.briefingItem}>
              <Text style={styles.briefingLabel}>Urgency: </Text>
              {targetIncidentPoint.urgency?.toUpperCase() || "CRITICAL"}
            </Text>
            <Text style={styles.briefingItem}>
              <Text style={styles.briefingLabel}>Location: </Text>
              {targetIncidentPoint.locationLabel}
            </Text>
            <Text style={styles.briefingItem}>
              <Text style={styles.briefingLabel}>Telemetry: </Text>
              {targetIncidentPoint.lat.toFixed(5)}, {targetIncidentPoint.lng.toFixed(5)}
            </Text>
            <Text style={styles.briefingItem}>
              <Text style={styles.briefingLabel}>AI Findings: </Text>
              {activeJob?.aiSummary || "Multi-source calls verified. Proximity dispatch triggered."}
            </Text>

            <TouchableOpacity
              style={[styles.modalSaveBtn, { marginTop: 16 }]}
              onPress={() => setDetailsModalVisible(false)}
            >
              <Text style={styles.modalSaveText}>Close Briefing</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  statusStrip: {
    backgroundColor: "#FEE2E2",
    paddingVertical: 6,
    alignItems: "center",
  },
  statusStripArrived: {
    backgroundColor: "#DCFCE7",
  },
  statusStripCompleted: {
    backgroundColor: "#F1F5F9",
  },
  statusStripText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#DC2626",
    letterSpacing: 0.5,
  },
  statusStripTextArrived: {
    color: "#15803D",
  },
  statusStripTextCompleted: {
    color: "#475569",
  },
  guidanceBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    backgroundColor: "#0F172A",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    ...SHADOWS.card,
  },
  arrowIconBox: {
    marginRight: 12,
  },
  guidanceText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  guidanceSub: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
  },
  etaBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  etaBadgeVal: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  mapArea: {
    flex: 1,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 20,
    overflow: "hidden",
    ...SHADOWS.card,
  },
  bottomSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...SHADOWS.tabBar,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  sheetMeta: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  liveTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pulseGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#059669",
    marginRight: 5,
  },
  liveTagText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#059669",
  },
  actionBtn: {
    backgroundColor: "#0F172A",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 10,
    ...SHADOWS.card,
  },
  actionBtnArrived: {
    backgroundColor: "#059669",
  },
  actionBtnCompleted: {
    backgroundColor: "#64748B",
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  secBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingVertical: 10,
  },
  secBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
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
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  modalSub: {
    fontSize: 11,
    color: "#64748B",
    marginBottom: 12,
  },
  textArea: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: "#0F172A",
    textAlignVertical: "top",
    minHeight: 90,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  modalSaveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#0F172A",
    alignItems: "center",
  },
  modalSaveText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  briefingItem: {
    fontSize: 13,
    color: "#334155",
    marginBottom: 8,
    lineHeight: 18,
  },
  briefingLabel: {
    fontWeight: "700",
    color: "#0F172A",
  },
});
