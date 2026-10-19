export const COLORS = {
  // Backgrounds & Neutral
  background: "#F8FAFC",
  surface: "#FFFFFF",
  surfaceSubtle: "#F1F5F9",
  border: "#E2E8F0",
  borderSubtle: "#EEF2F6",

  // Text colors
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#94A3B8",
  textLight: "#FFFFFF",

  // Emergency / SOS Accents
  sosPrimary: "#E11D48",       // Vibrant Crimson
  sosGlow: "rgba(225, 29, 72, 0.22)",
  sosWaveOuter: "rgba(225, 29, 72, 0.08)",
  sosWaveInner: "rgba(225, 29, 72, 0.16)",

  // Duty / Responder Accents
  dutyPrimary: "#059669",      // Resolute Emerald Green
  dutySubtle: "#D1FAE5",
  dutyDark: "#065F46",

  // Status Colors
  warning: "#D97706",
  warningBg: "#FEF3C7",
  info: "#2563EB",
  infoBg: "#DBEAFE",
  resolved: "#10B981",
  resolvedBg: "#ECFDF5",
  inReview: "#F59E0B",
  inReviewBg: "#FFFBEB",
  dispatched: "#8B5CF6",
  dispatchedBg: "#F3E8FF",

  // Brand Accents
  brandNavy: "#1E293B",
  brandBlue: "#0284C7",
};

export const SHADOWS = {
  card: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  cardHover: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  },
  sosButton: {
    shadowColor: "#E11D48",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 10,
  },
  tabBar: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 8,
  },
};
