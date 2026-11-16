import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS, SHADOWS } from "../../theme";
import { TacticalCampusMap, MapIncidentMarker } from "../../components/map/TacticalCampusMap";
import { NearbyAlert } from "../../types";

interface CitizenAlertsScreenProps {
  alerts: NearbyAlert[];
  onOpenReportWizard: () => void;
}

export const CitizenAlertsScreen: React.FC<CitizenAlertsScreenProps> = ({
  alerts,
  onOpenReportWizard,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<"all" | "active" | "caution">("all");
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  // Transform NearbyAlert into MapIncidentMarker format
  const mapIncidents: MapIncidentMarker[] = useMemo(() => {
    return alerts.map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category,
      urgency: a.urgency,
      lat: a.location?.lat ?? 28.5452,
      lng: a.location?.lng ?? 77.2731,
      locationLabel: a.locationLabel,
      tone: a.tone || (a.status === "active" ? "active" : "caution"),
      distanceLabel: a.distance,
    }));
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    if (selectedFilter === "all") return alerts;
    if (selectedFilter === "active") return alerts.filter((a) => a.status === "active" || a.tone === "active");
    return alerts.filter((a) => a.status !== "active" && a.tone !== "active");
  }, [alerts, selectedFilter]);

  const activeTargetIncident = useMemo(() => {
    if (!selectedAlertId) return null;
    return mapIncidents.find((m) => m.id === selectedAlertId) || null;
  }, [selectedAlertId, mapIncidents]);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>Nearby alerts</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{filteredAlerts.length} Active</Text>
          </View>
        </View>

        <Text style={styles.privacyNote}>
          Coarsened operational notices. Sensitive personal locations are coarsened for campus privacy.
        </Text>

        {/* Dynamic Interactive Tactical Campus Map */}
        <View style={styles.mapContainer}>
          <TacticalCampusMap
            height={230}
            incidents={mapIncidents}
            targetIncident={activeTargetIncident}
            onSelectIncident={(inc) => setSelectedAlertId(inc.id)}
            selfPoint={{ lat: 28.5452, lng: 77.2731 }}
          />
        </View>

        {/* Filter Chips */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, selectedFilter === "all" && styles.filterChipActive]}
            onPress={() => setSelectedFilter("all")}
          >
            <Text style={[styles.filterChipText, selectedFilter === "all" && styles.filterChipTextActive]}>
              All ({alerts.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, selectedFilter === "active" && styles.filterChipActive]}
            onPress={() => setSelectedFilter("active")}
          >
            <Text style={[styles.filterChipText, selectedFilter === "active" && styles.filterChipTextActive]}>
              Active Emergencies
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, selectedFilter === "caution" && styles.filterChipActive]}
            onPress={() => setSelectedFilter("caution")}
          >
            <Text style={[styles.filterChipText, selectedFilter === "caution" && styles.filterChipTextActive]}>
              Advisories
            </Text>
          </TouchableOpacity>
        </View>

        {/* Nearby Alert Cards List */}
        <View style={styles.alertsList}>
          {filteredAlerts.length > 0 ? (
            filteredAlerts.map((alert) => {
              const isActive = alert.status === "active" || alert.tone === "active";
              const isSelected = selectedAlertId === alert.id;

              return (
                <TouchableOpacity
                  key={alert.id}
                  activeOpacity={0.8}
                  style={[styles.alertCard, isSelected && styles.alertCardSelected]}
                  onPress={() => setSelectedAlertId(alert.id)}
                >
                  <View
                    style={[
                      styles.accentBar,
                      {
                        backgroundColor: isActive
                          ? COLORS.sosPrimary
                          : COLORS.warning,
                      },
                    ]}
                  />
                  <View style={styles.cardContent}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.alertTitle} numberOfLines={1}>
                        {alert.title}
                      </Text>
                      <Text style={styles.alertDistance}>{alert.distance}</Text>
                    </View>

                    <Text style={styles.alertLocation}>
                      {alert.locationLabel} · Coarsened
                    </Text>

                    <View style={styles.badgeRow}>
                      <View
                        style={[
                          styles.statusBadge,
                          isActive && styles.activeBadge,
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            isActive && styles.activeBadgeText,
                          ]}
                        >
                          {alert.badgeText || (isActive ? "ACTIVE EMERGENCY" : "CAUTION")}
                        </Text>
                      </View>

                      {isSelected && (
                        <View style={styles.selectedMarkerIndicator}>
                          <Feather name="crosshair" size={12} color="#0284C7" />
                          <Text style={styles.selectedMarkerText}>Focused on map</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={styles.emptyStateBox}>
              <Feather name="check-circle" size={32} color="#10B981" />
              <Text style={styles.emptyStateTitle}>All Clear Around You</Text>
              <Text style={styles.emptyStateSub}>No active emergency alerts in your immediate radius.</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Floating Action Button "Report new incident" */}
      <View style={styles.footer}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onOpenReportWizard}
          style={styles.reportNewBtn}
        >
          <Feather name="plus-circle" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.reportNewBtnText}>Report new incident</Text>
        </TouchableOpacity>
      </View>
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
    paddingTop: 12,
    paddingBottom: 85,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  countBadge: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  countBadgeText: {
    color: "#B91C1C",
    fontSize: 11,
    fontWeight: "700",
  },
  privacyNote: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 4,
    marginBottom: 12,
  },
  mapContainer: {
    marginBottom: 14,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  filterChipActive: {
    backgroundColor: "#0F172A",
    borderColor: "#0F172A",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  alertsList: {
    gap: 10,
  },
  alertCard: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    overflow: "hidden",
    ...SHADOWS.card,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  alertCardSelected: {
    borderColor: "#0284C7",
    borderWidth: 1.5,
  },
  accentBar: {
    width: 5,
  },
  cardContent: {
    flex: 1,
    padding: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  alertDistance: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
  },
  alertLocation: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 3,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  statusBadge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activeBadge: {
    backgroundColor: "#FEE2E2",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#B45309",
  },
  activeBadgeText: {
    color: "#B91C1C",
  },
  selectedMarkerIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  selectedMarkerText: {
    fontSize: 10,
    color: "#0284C7",
    fontWeight: "600",
  },
  emptyStateBox: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    marginTop: 10,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 8,
  },
  emptyStateSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 4,
    textAlign: "center",
  },
  footer: {
    position: "absolute",
    bottom: 14,
    left: 16,
    right: 16,
  },
  reportNewBtn: {
    backgroundColor: "#0F172A",
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    ...SHADOWS.cardHover,
  },
  reportNewBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
