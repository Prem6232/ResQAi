import React from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, SHADOWS } from "../../theme";
import { Role } from "../../types";

interface RoleSwitcherModalProps {
  visible: boolean;
  currentRole: Role;
  onSelectRole: (role: Role) => void;
  onClose: () => void;
}

export const RoleSwitcherModal: React.FC<RoleSwitcherModalProps> = ({
  visible,
  currentRole,
  onSelectRole,
  onClose,
}) => {
  const roles: Array<{
    id: Role;
    title: string;
    description: string;
    icon: any;
    color: string;
    bg: string;
  }> = [
    {
      id: "citizen",
      title: "Citizen App",
      description: "Hold 3s SOS, 6 incident categories, nearby radar alerts, my reports & trusted contacts.",
      icon: "account-alert",
      color: COLORS.sosPrimary,
      bg: "#FFE4E6",
    },
    {
      id: "responder",
      title: "First Responder App",
      description: "On-Duty toggle, awaiting response job offer, turn-by-turn routing & unit status.",
      icon: "truck-fast",
      color: COLORS.dutyPrimary,
      bg: "#DCFCE7",
    },
    {
      id: "operator",
      title: "Control Room Dashboard",
      description: "Live incident stream, AI triage panel with voice transcript & responder dispatch.",
      icon: "view-dashboard",
      color: COLORS.info,
      bg: "#DBEAFE",
    },
  ];

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Switch App Role</Text>
              <Text style={styles.subtitle}>
                Demonstrate the full multi-actor workflow
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.roleList}>
            {roles.map((r) => {
              const isSelected = currentRole === r.id;
              return (
                <TouchableOpacity
                  key={r.id}
                  activeOpacity={0.7}
                  onPress={() => {
                    onSelectRole(r.id);
                    onClose();
                  }}
                  style={[
                    styles.roleCard,
                    isSelected && styles.roleCardSelected,
                  ]}
                >
                  <View style={[styles.iconBox, { backgroundColor: r.bg }]}>
                    <MaterialCommunityIcons
                      name={r.icon}
                      size={24}
                      color={r.color}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.roleTitle}>{r.title}</Text>
                    <Text style={styles.roleDesc}>{r.description}</Text>
                  </View>
                  {isSelected ? (
                    <Feather name="check-circle" size={20} color="#059669" />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  content: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 20,
    ...SHADOWS.cardHover,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  roleList: {
    gap: 12,
  },
  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surfaceSubtle,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  roleCardSelected: {
    borderColor: COLORS.textPrimary,
    backgroundColor: "#F8FAFC",
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  roleTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  roleDesc: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
});
