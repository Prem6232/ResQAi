import React from "react";
import { TouchableOpacity, Text, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { COLORS, SHADOWS } from "../../theme";
import { IncidentCategory } from "../../types";

interface CategoryCardProps {
  category: IncidentCategory;
  title: string;
  onPress: () => void;
}

export const CategoryCard: React.FC<CategoryCardProps> = ({
  category,
  title,
  onPress,
}) => {
  const getIconConfig = () => {
    switch (category) {
      case "fire_smoke":
        return {
          icon: "fire",
          type: "material" as const,
          color: "#E11D48",
          bg: "#FFE4E6",
        };
      case "road_accident":
        return {
          icon: "car",
          type: "material" as const,
          color: "#0284C7",
          bg: "#E0F2FE",
        };
      case "water_flood":
        return {
          icon: "water-outline",
          type: "material" as const,
          color: "#0891B2",
          bg: "#CFFAFE",
        };
      case "medical":
        return {
          icon: "heart-pulse",
          type: "material" as const,
          color: "#E11D48",
          bg: "#FFE4E6",
        };
      case "personal_sos":
        return {
          icon: "phone-alert",
          type: "material" as const,
          color: "#9333EA",
          bg: "#F3E8FF",
        };
      case "hazard":
      default:
        return {
          icon: "alert-triangle",
          type: "feather" as const,
          color: "#D97706",
          bg: "#FEF3C7",
        };
    }
  };

  const config = getIconConfig();

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={styles.card}
    >
      <View style={[styles.iconCircle, { backgroundColor: config.bg }]}>
        {config.type === "material" ? (
          <MaterialCommunityIcons
            name={config.icon as any}
            size={22}
            color={config.color}
          />
        ) : (
          <Feather
            name={config.icon as any}
            size={20}
            color={config.color}
          />
        )}
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    ...SHADOWS.card,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
});
