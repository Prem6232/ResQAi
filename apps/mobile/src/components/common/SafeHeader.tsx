import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { COLORS } from "../../theme";
import { Role } from "../../types";
import { mobileApi } from "../../services/api";

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
  const [isBackendLive, setIsBackendLive] = useState<boolean | null>(null);

  useEffect(() => {
    mobileApi.checkHealth().then((h) => setIsBackendLive(h.connected));
    const unsubscribe = mobileApi.onConnectionChange((connected) => {
      setIsBackendLive(connected);
    });
    return unsubscribe;
  }, []);

  const handleRetryHealth = () => {
    setIsBackendLive(null);
    mobileApi.checkHealth().then((h) => setIsBackendLive(h.connected));
  };

  const roleLabel = role === "citizen" ? "CITIZEN" : "FIRST RESPONDER";
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
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleRetryHealth}
              style={[
                styles.liveBackendBadge,
                isBackendLive === false && styles.liveBackendBadgeOffline,
              ]}
            >
              <View
                style={[
                  styles.livePulseDot,
                  isBackendLive === false && styles.livePulseDotOffline,
                  isBackendLive === null && styles.livePulseDotConnecting,
                ]}
              />
              <Text
                style={[
                  styles.liveBackendText,
                  isBackendLive === false && styles.liveBackendTextOffline,
                ]}
              >
                {isBackendLive === true
                  ? "BACKEND LIVE"
                  : isBackendLive === false
                  ? "RECONNECT"
                  : "CONNECTING…"}
              </Text>
            </TouchableOpacity>
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
          ]}
        >
          <Text
            style={[
              styles.roleBadgeText,
              isResponder && styles.responderBadgeText,
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
    width: 32,
    height: 32,
  },
  brandTextCol: {
    justifyContent: "center",
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  liveBackendBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  liveBackendBadgeOffline: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  livePulseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#059669",
    marginRight: 4,
  },
  livePulseDotOffline: {
    backgroundColor: "#DC2626",
  },
  livePulseDotConnecting: {
    backgroundColor: "#F59E0B",
  },
  liveBackendText: {
    fontSize: 8,
    fontWeight: "800",
    color: "#065F46",
    letterSpacing: 0.3,
  },
  liveBackendTextOffline: {
    color: "#991B1B",
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
    backgroundColor: COLORS.dutyPrimary,
    marginRight: 5,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  responderBadge: {
    backgroundColor: "#ECFDF5",
    borderColor: "#059669",
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  responderBadgeText: {
    color: "#059669",
  },
});
