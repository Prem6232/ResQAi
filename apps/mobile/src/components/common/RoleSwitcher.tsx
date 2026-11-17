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
import { Role, UserProfile } from "../../types";

interface RoleSwitcherModalProps {
  visible: boolean;
  currentRole: Role;
  onSelectRole: (role: Role) => void;
  onClose: () => void;
  onLogout?: () => void;
  currentUser?: UserProfile | null;
}

export const RoleSwitcherModal: React.FC<RoleSwitcherModalProps> = ({
  visible,
  currentRole,
  onSelectRole,
  onClose,
  onLogout,
  currentUser,
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
      description: "Emergency SOS beacon, 6 incident categories, nearby alerts & trusted contacts.",
      icon: "account-alert",
      color: COLORS.sosPrimary,
      bg: "#FFE4E6",
    },
    {
      id: "responder",
      title: "First Responder App",
      description: "On-Duty toggle, 90s dispatch offers, active turn-by-turn navigation & status.",
      icon: "truck-fast",
      color: COLORS.dutyPrimary,
      bg: "#DCFCE7",
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
                Toggle between Citizen and First Responder mode
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
                  {isSelected && (
                    <Feather name="check" size={18} color={COLORS.brandBlue} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* User Account Info & Logout */}
          {currentUser && (
            <View style={styles.userSection}>
              <View style={styles.userInfoCol}>
                <Text style={styles.userNameText}>{currentUser.fullName || currentUser.name}</Text>
                <Text style={styles.userEmailText}>{currentUser.email}</Text>
              </View>
            </View>
          )}

          {onLogout && (
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.logoutBtn}
              onPress={() => {
                onClose();
                onLogout();
              }}
            >
              <Feather name="log-out" size={16} color="#E11D48" />
              <Text style={styles.logoutBtnText}>Sign Out / Switch Account</Text>
            </TouchableOpacity>
          )}
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
    alignItems: "center",
    padding: 20,
  },
  content: {
    width: "100%",
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.cardHover,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
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
    padding: 4,
  },
  roleList: {
    gap: 12,
  },
  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  roleCardSelected: {
    borderColor: COLORS.brandBlue,
    backgroundColor: "#F0F9FF",
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
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
  userSection: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  userInfoCol: {
    marginBottom: 4,
  },
  userNameText: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  userEmailText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
    paddingVertical: 10,
    backgroundColor: "#FFF1F2",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FECDD3",
  },
  logoutBtnText: {
    color: "#E11D48",
    fontSize: 12,
    fontWeight: "700",
  },
});
