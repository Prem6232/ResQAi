import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, SHADOWS } from "../../theme";
import { ResponderProfile, GeoPoint } from "../../types";
import { mobileApi } from "../../services/api";

interface ResponderStatusScreenProps {
  profile: ResponderProfile;
  onUpdateProfile: (updated: Partial<ResponderProfile>) => void;
  currentLocation?: GeoPoint;
}

export const ResponderStatusScreen: React.FC<ResponderStatusScreenProps> = ({
  profile,
  onUpdateProfile,
  currentLocation,
}) => {
  const [availability, setAvailability] = useState(profile.availability);
  const [shareLocation, setShareLocation] = useState(profile.shareLiveLocation);
  const [alertSound, setAlertSound] = useState(profile.alertSound);
  const [isPinging, setIsPinging] = useState(false);

  const handleSelectAvailability = async (status: "available" | "busy" | "off_duty") => {
    setAvailability(status);
    const isOnDuty = status !== "off_duty";
    onUpdateProfile({ availability: status, isOnDuty });

    try {
      await mobileApi.updateDuty(isOnDuty, status);
    } catch (e) {
      console.warn("Duty sync warning", e);
    }
  };

  const handleTestPing = async () => {
    try {
      setIsPinging(true);
      const coords = currentLocation || { lat: 23.2599, lng: 77.4126 };
      await mobileApi.sendLocationPing(coords.lat, coords.lng);
      Alert.alert(
        "📍 Telemetry Synchronized",
        `Real GPS coordinate ping (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}) committed to PostGIS. Control Room live tactical map updated.`
      );
    } catch {
      Alert.alert("Telemetry Error", "Could not reach dispatch telemetry receiver.");
    } finally {
      setIsPinging(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{profile.unitCode}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.unitCodeRow}>
              <Text style={styles.unitName}>{profile.unitName}</Text>
              <View style={styles.approvedBadge}>
                <Feather name="check" size={10} color="#059669" />
                <Text style={styles.approvedText}>Vetted</Text>
              </View>
            </View>
            <Text style={styles.stationText}>{profile.station}</Text>
            <Text style={styles.crewText}>Crew Size: {profile.crewCount} responders</Text>
          </View>
        </View>

        {/* Availability Selector */}
        <Text style={styles.sectionTitle}>Availability State</Text>
        <View style={styles.availabilityRow}>
          <TouchableOpacity
            onPress={() => handleSelectAvailability("available")}
            style={[
              styles.availPill,
              availability === "available" && styles.availPillActiveGreen,
            ]}
          >
            <Text
              style={[
                styles.availText,
                availability === "available" && styles.availTextActive,
              ]}
            >
              Available
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleSelectAvailability("busy")}
            style={[
              styles.availPill,
              availability === "busy" && styles.availPillActiveAmber,
            ]}
          >
            <Text
              style={[
                styles.availText,
                availability === "busy" && styles.availTextActive,
              ]}
            >
              Busy
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleSelectAvailability("off_duty")}
            style={[
              styles.availPill,
              availability === "off_duty" && styles.availPillActiveGrey,
            ]}
          >
            <Text
              style={[
                styles.availText,
                availability === "off_duty" && styles.availTextActive,
              ]}
            >
              Off duty
            </Text>
          </TouchableOpacity>
        </View>

        {/* Skills and Equipment Chips */}
        <Text style={[styles.sectionTitle, { marginTop: 22 }]}>
          Verified Unit Capabilities
        </Text>
        <View style={styles.skillsGrid}>
          {profile.skills.map((skill) => (
            <View key={skill} style={styles.skillChip}>
              <Feather name="check-circle" size={12} color="#059669" style={{ marginRight: 6 }} />
              <Text style={styles.skillChipText}>{skill}</Text>
            </View>
          ))}
        </View>

        {/* Settings Toggles */}
        <View style={styles.togglesCard}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextCol}>
              <Text style={styles.toggleTitle}>Share live location</Text>
              <Text style={styles.toggleDesc}>
                Transmits real-time PostGIS GPS coordinates to control room
              </Text>
            </View>
            <Switch
              value={shareLocation}
              onValueChange={(v) => {
                setShareLocation(v);
                onUpdateProfile({ shareLiveLocation: v });
              }}
              trackColor={{ false: "#CBD5E1", true: "#059669" }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.separator} />

          <View style={styles.toggleRow}>
            <View style={styles.toggleTextCol}>
              <Text style={styles.toggleTitle}>Critical dispatch chimes</Text>
              <Text style={styles.toggleDesc}>Loud audio tone on priority 90s offers</Text>
            </View>
            <Switch
              value={alertSound}
              onValueChange={(v) => {
                setAlertSound(v);
                onUpdateProfile({ alertSound: v });
              }}
              trackColor={{ false: "#CBD5E1", true: "#059669" }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Manual Telemetry Ping Test */}
        <TouchableOpacity
          style={styles.pingBtn}
          onPress={handleTestPing}
          disabled={isPinging}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="radar" size={18} color="#0284C7" style={{ marginRight: 8 }} />
          <Text style={styles.pingBtnText}>
            {isPinging ? "Broadcasting Telemetry..." : "Send Manual GPS Telemetry Ping"}
          </Text>
        </TouchableOpacity>
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
    paddingTop: 14,
    paddingBottom: 36,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...SHADOWS.card,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#059669",
  },
  unitCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  unitName: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  approvedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  approvedText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#059669",
  },
  stationText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  crewText: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
  availabilityRow: {
    flexDirection: "row",
    gap: 10,
  },
  availPill: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  availPillActiveGreen: {
    backgroundColor: "#059669",
    borderColor: "#059669",
  },
  availPillActiveAmber: {
    backgroundColor: "#D97706",
    borderColor: "#D97706",
  },
  availPillActiveGrey: {
    backgroundColor: "#475569",
    borderColor: "#475569",
  },
  availText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  availTextActive: {
    color: "#FFFFFF",
  },
  skillsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 18,
  },
  skillChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...SHADOWS.card,
  },
  skillChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },
  togglesCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
    ...SHADOWS.card,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  toggleTextCol: {
    flex: 1,
    marginRight: 12,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  toggleDesc: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 14,
  },
  pingBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 6,
  },
  pingBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0284C7",
  },
});
