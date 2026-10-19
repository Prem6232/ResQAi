import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from "react-native";
import { COLORS, SHADOWS } from "../../theme";
import { ResponderProfile } from "../../types";

interface ResponderStatusScreenProps {
  profile: ResponderProfile;
  onUpdateProfile: (updated: Partial<ResponderProfile>) => void;
}

export const ResponderStatusScreen: React.FC<ResponderStatusScreenProps> = ({
  profile,
  onUpdateProfile,
}) => {
  const [availability, setAvailability] = useState(profile.availability);
  const [shareLocation, setShareLocation] = useState(profile.shareLiveLocation);
  const [alertSound, setAlertSound] = useState(profile.alertSound);

  const handleSelectAvailability = (status: "available" | "busy" | "off_duty") => {
    setAvailability(status);
    onUpdateProfile({ availability: status });
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
          <View>
            <Text style={styles.unitName}>{profile.unitName}</Text>
            <Text style={styles.stationText}>{profile.station}</Text>
          </View>
        </View>

        {/* Availability Selector */}
        <Text style={styles.sectionTitle}>Availability</Text>
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
        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
          Skills and equipment
        </Text>
        <View style={styles.skillsGrid}>
          {profile.skills.map((skill) => (
            <View key={skill} style={styles.skillChip}>
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
                Visible to dispatchers on duty
              </Text>
            </View>
            <Switch
              value={shareLocation}
              onValueChange={(v) => {
                setShareLocation(v);
                onUpdateProfile({ shareLiveLocation: v });
              }}
              trackColor={{ false: "#CBD5E1", true: "#059669" }}
              thumbColor={"#FFFFFF"}
            />
          </View>

          <View style={styles.separator} />

          <View style={styles.toggleRow}>
            <View style={styles.toggleTextCol}>
              <Text style={styles.toggleTitle}>Alert sound</Text>
              <Text style={styles.toggleDesc}>Loud for critical jobs</Text>
            </View>
            <Switch
              value={alertSound}
              onValueChange={(v) => {
                setAlertSound(v);
                onUpdateProfile({ alertSound: v });
              }}
              trackColor={{ false: "#CBD5E1", true: "#059669" }}
              thumbColor={"#FFFFFF"}
            />
          </View>
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
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    ...SHADOWS.card,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
  unitName: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  stationText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
  availabilityRow: {
    flexDirection: "row",
    gap: 8,
  },
  availPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
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
    backgroundColor: "#64748B",
    borderColor: "#64748B",
  },
  availText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  availTextActive: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  skillsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 24,
  },
  skillChip: {
    backgroundColor: "#059669",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  skillChipText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  togglesCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    ...SHADOWS.card,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  toggleTextCol: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  toggleDesc: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.borderSubtle,
  },
});
