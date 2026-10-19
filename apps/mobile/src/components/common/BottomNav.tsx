import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS, SHADOWS } from "../../theme";
import { Role } from "../../types";

export type CitizenTab = "home" | "alerts" | "reports" | "contacts";
export type ResponderTab = "feed" | "nav" | "history" | "status";

interface BottomNavProps {
  role: Role;
  activeTab: string;
  onTabChange: (tab: any) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  role,
  activeTab,
  onTabChange,
}) => {
  const citizenTabs: Array<{ id: CitizenTab; label: string; icon: keyof typeof Feather.glyphMap }> = [
    { id: "home", label: "Home", icon: "home" },
    { id: "alerts", label: "Alerts", icon: "bell" },
    { id: "reports", label: "My Reports", icon: "file-text" },
    { id: "contacts", label: "Contacts", icon: "users" },
  ];

  const responderTabs: Array<{ id: ResponderTab; label: string; icon: keyof typeof Feather.glyphMap }> = [
    { id: "feed", label: "Feed", icon: "menu" },
    { id: "nav", label: "Active Nav", icon: "navigation" },
    { id: "history", label: "History", icon: "clock" },
    { id: "status", label: "Status", icon: "user" },
  ];

  const tabs = role === "responder" ? responderTabs : citizenTabs;
  const activeColor = role === "responder" ? COLORS.dutyPrimary : COLORS.sosPrimary;

  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            activeOpacity={0.7}
            onPress={() => onTabChange(tab.id)}
            style={styles.tabButton}
          >
            <Feather
              name={tab.icon}
              size={20}
              color={isActive ? activeColor : COLORS.textMuted}
            />
            <Text
              style={[
                styles.tabLabel,
                { color: isActive ? activeColor : COLORS.textMuted },
                isActive && styles.tabLabelActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 68,
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSubtle,
    alignItems: "center",
    justifyContent: "space-around",
    paddingBottom: 6,
    ...SHADOWS.tabBar,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 4,
  },
  tabLabelActive: {
    fontWeight: "700",
  },
});
