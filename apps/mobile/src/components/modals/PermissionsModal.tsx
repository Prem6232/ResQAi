import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  PermissionsAndroid,
  ActivityIndicator,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS } from "../../theme";

interface PermissionsModalProps {
  visible: boolean;
  onComplete: () => void;
}

export async function requestDevicePermissions(): Promise<{
  location: boolean;
  camera: boolean;
  storage: boolean;
  notifications: boolean;
}> {
  if (Platform.OS !== "android") {
    return { location: true, camera: true, storage: true, notifications: true };
  }

  try {
    const permissionsToRequest: any[] = [
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      PermissionsAndroid.PERMISSIONS.CAMERA,
    ];

    if (Number(Platform.Version) >= 33) {
      if ((PermissionsAndroid.PERMISSIONS as any).POST_NOTIFICATIONS) {
        permissionsToRequest.push((PermissionsAndroid.PERMISSIONS as any).POST_NOTIFICATIONS);
      }
      if ((PermissionsAndroid.PERMISSIONS as any).READ_MEDIA_IMAGES) {
        permissionsToRequest.push((PermissionsAndroid.PERMISSIONS as any).READ_MEDIA_IMAGES);
      }
    } else {
      if (PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE) {
        permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
      }
      if (PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE) {
        permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
      }
    }

    const rawResults = await PermissionsAndroid.requestMultiple(permissionsToRequest);
    const results = rawResults as Record<string, string>;

    const locationGranted =
      results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED ||
      results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;

    const cameraGranted =
      results[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED;

    const storageGranted =
      (Number(Platform.Version) >= 33 && results[(PermissionsAndroid.PERMISSIONS as any).READ_MEDIA_IMAGES] === PermissionsAndroid.RESULTS.GRANTED) ||
      results[PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE] === PermissionsAndroid.RESULTS.GRANTED ||
      true;

    const notifGranted =
      !(PermissionsAndroid.PERMISSIONS as any).POST_NOTIFICATIONS ||
      results[(PermissionsAndroid.PERMISSIONS as any).POST_NOTIFICATIONS] === PermissionsAndroid.RESULTS.GRANTED;

    return {
      location: locationGranted,
      camera: cameraGranted,
      storage: storageGranted,
      notifications: notifGranted,
    };
  } catch (err) {
    console.warn("Permission request error:", err);
    return { location: false, camera: false, storage: false, notifications: false };
  }
}

export const PermissionsModal: React.FC<PermissionsModalProps> = ({
  visible,
  onComplete,
}) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({
    location: false,
    camera: false,
    storage: false,
    notifications: false,
  });

  const handleGrantPermissions = async () => {
    setLoading(true);
    try {
      const results = await requestDevicePermissions();
      setStatus(results);
    } finally {
      setLoading(false);
      onComplete();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Header Icon & Brand */}
          <View style={styles.headerArea}>
            <View style={styles.shieldIconWrapper}>
              <Feather name="shield" size={36} color="#059669" />
            </View>
            <Text style={styles.title}>Safety Permissions</Text>
            <Text style={styles.subtitle}>
              ResQAi coordinates critical life safety, rapid emergency dispatch, and disaster response across Bhopal City.
            </Text>
          </View>

          {/* Permission Cards */}
          <View style={styles.permissionList}>
            {/* 1. Location */}
            <View style={styles.card}>
              <View style={[styles.iconBox, { backgroundColor: "#DBEAFE" }]}>
                <Feather name="map-pin" size={22} color="#2563EB" />
              </View>
              <View style={styles.cardContent}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>GPS Location</Text>
                  <Text style={styles.badgeRequired}>Essential</Text>
                </View>
                <Text style={styles.cardDesc}>
                  Enables 1-tap SOS telemetry transmission to security desks and draws live routes on the Bhopal OpenStreetMap grid.
                </Text>
              </View>
            </View>

            {/* 2. Camera */}
            <View style={styles.card}>
              <View style={[styles.iconBox, { backgroundColor: "#FEF3C7" }]}>
                <Feather name="camera" size={22} color="#D97706" />
              </View>
              <View style={styles.cardContent}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>Camera Access</Text>
                  <Text style={styles.badgeRecommended}>Important</Text>
                </View>
                <Text style={styles.cardDesc}>
                  Allows immediate photo capture of hazards, smoke, fire, or accident scenes to feed AI visual triage.
                </Text>
              </View>
            </View>

            {/* 3. Files & Media */}
            <View style={styles.card}>
              <View style={[styles.iconBox, { backgroundColor: "#ECFDF5" }]}>
                <Feather name="image" size={22} color="#059669" />
              </View>
              <View style={styles.cardContent}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>Files & Media</Text>
                  <Text style={styles.badgeRecommended}>Important</Text>
                </View>
                <Text style={styles.cardDesc}>
                  Required to attach photo evidence and audio transcripts directly from your phone's storage.
                </Text>
              </View>
            </View>

            {/* 4. Notifications */}
            <View style={styles.card}>
              <View style={[styles.iconBox, { backgroundColor: "#F3E8FF" }]}>
                <Feather name="bell" size={22} color="#8B5CF6" />
              </View>
              <View style={styles.cardContent}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>Emergency Alerts</Text>
                  <Text style={styles.badgeRequired}>Essential</Text>
                </View>
                <Text style={styles.cardDesc}>
                  Receive sirens, high-priority evacuation notices, and real-time mission dispatch alerts.
                </Text>
              </View>
            </View>
          </View>

          {/* Privacy Note */}
          <View style={styles.privacyBox}>
            <Feather name="lock" size={14} color="#059669" />
            <Text style={styles.privacyText}>
              Your data is encrypted end-to-end and strictly governed by Bhopal Disaster Management protocols.
            </Text>
          </View>
        </ScrollView>

        {/* Footer Actions */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.85}
            onPress={handleGrantPermissions}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.primaryBtnText}>Enable Device Permissions</Text>
                <Feather name="arrow-right" size={18} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipBtn}
            activeOpacity={0.7}
            onPress={onComplete}
          >
            <Text style={styles.skipBtnText}>Continue with Standard Access</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 24,
  },
  headerArea: {
    alignItems: "center",
    marginBottom: 28,
  },
  shieldIconWrapper: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#D1FAE5",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  permissionList: {
    gap: 12,
    marginBottom: 20,
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    alignItems: "flex-start",
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  cardContent: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  badgeRequired: {
    fontSize: 10,
    fontWeight: "800",
    color: "#E11D48",
    backgroundColor: "#FFE4E6",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeRecommended: {
    fontSize: 10,
    fontWeight: "800",
    color: "#D97706",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cardDesc: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 17,
  },
  privacyBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    gap: 8,
    marginBottom: 10,
  },
  privacyText: {
    fontSize: 11,
    color: "#166534",
    flex: 1,
    lineHeight: 16,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    gap: 8,
  },
  primaryBtn: {
    backgroundColor: "#059669",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  skipBtn: {
    paddingVertical: 10,
    alignItems: "center",
  },
  skipBtnText: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "600",
  },
});
