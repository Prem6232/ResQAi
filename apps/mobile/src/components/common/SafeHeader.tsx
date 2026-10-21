import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { COLORS } from "../../theme";
import { Role } from "../../types";

interface SafeHeaderProps {
  role: Role;
  subtitle?: string;
  onRoleSwitchPress?: () => void;
  rightComponent?: React.ReactNode;
}

export const SafeHeader: React.FC<SafeHeaderProps> = ({
  role,
  subtitle = "Live location on",
  onRoleSwitchPress,
  rightComponent,
}) => {
  const roleLabel =
    role === "citizen"
      ? "CITIZEN"
      : role === "responder"
      ? "FIRST RESPONDER"
      : "CONTROL ROOM";

  const isResponder = role === "responder";

  return (
    <View style={styles.container}>
      <View style={styles.leftRow}>
        <Image
          source={require("../../../assets/logo-tight.png")}
          style={styles.logoImage}
          resizeMode="contain"
        />
        <View style={styles.brandTextCol}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={styles.brandTitle}>ResQAI</Text>
            <View style={styles.liveBackendBadge}>
              <View style={styles.livePulseDot} />
              <Text style={styles.liveBackendText}>BACKEND LIVE</Text>
            </View>
          </View>
          {subtitle ? (
            <View style={styles.locationRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isResponder ? COLORS.dutyPrimary : COLORS.brandBlue },
                ]}
              />
              <Text style={styles.locationSubtitle}>{subtitle}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.rightRow}>
        {rightComponent}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onRoleSwitchPress}
          style={[
            styles.roleBadge,
            isResponder && styles.responderBadge,
            role === "operator" && styles.operatorBadge,
          ]}
        >
          <Text
            style={[
              styles.roleBadgeText,
              isResponder && styles.responderBadgeText,
              role === "operator" && styles.operatorBadgeText,
            ]}
          >
            {roleLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  leftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoImage: {
    width: 36,
    height: 36,
  },
  brandTextCol: {
    justifyContent: "center",
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  locationSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textSecondary,
  },
  rightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  roleBadge: {
    backgroundColor: COLORS.surfaceSubtle,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  responderBadge: {
    backgroundColor: COLORS.dutySubtle,
    borderColor: COLORS.dutyPrimary,
  },
  operatorBadge: {
    backgroundColor: "#EFF6FF",
    borderColor: COLORS.info,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.textSecondary,
    letterSpacing: 0.4,
  },
  responderBadgeText: {
    color: COLORS.dutyDark,
  },
  operatorBadgeText: {
    color: COLORS.info,
  },
  liveBackendBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#10B981",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 4,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  liveBackendText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#047857",
    letterSpacing: 0.5,
  },
});
