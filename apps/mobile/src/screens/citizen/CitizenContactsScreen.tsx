import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from "react-native";
import { COLORS, SHADOWS } from "../../theme";
import { TrustedContact } from "../../types";

interface CitizenContactsScreenProps {
  contacts: TrustedContact[];
  onAddContact: (contact: TrustedContact) => void;
}

export const CitizenContactsScreen: React.FC<CitizenContactsScreenProps> = ({
  contacts,
  onAddContact,
}) => {
  const [shareLiveLocation, setShareLiveLocation] = useState(true);
  const [notifyBySMS, setNotifyBySMS] = useState(true);

  const handlePromptAdd = () => {
    Alert.prompt
      ? Alert.prompt(
          "Add Trusted Contact",
          "Enter Name and Relation",
          (text) => {
            if (text) {
              const newContact: TrustedContact = {
                id: `c_${Date.now()}`,
                name: text,
                initials: text.slice(0, 2).toUpperCase(),
                relation: "Family",
                phone: "+91 98000 00000",
                status: "active",
              };
              onAddContact(newContact);
            }
          }
        )
      : Alert.alert("Add Contact", "Contact shortcut added to your trusted circle.");
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.pageTitle}>Trusted contacts</Text>
        <Text style={styles.pageSubtitle}>
          They get your live location when you press SOS.
        </Text>

        {/* Contacts List */}
        <View style={styles.contactsList}>
          {contacts.map((contact) => {
            const isActive = contact.status === "active";
            return (
              <View key={contact.id} style={styles.contactCard}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{contact.initials}</Text>
                </View>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{contact.name}</Text>
                  <Text style={styles.contactRelation}>{contact.relation}</Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    isActive ? styles.activePill : styles.pendingPill,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      isActive ? styles.activePillText : styles.pendingPillText,
                    ]}
                  >
                    {isActive ? "Active" : "Pending"}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Add Contact Button */}
        <TouchableOpacity
          onPress={handlePromptAdd}
          activeOpacity={0.7}
          style={styles.addContactBtn}
        >
          <Text style={styles.addContactText}>+ Add contact</Text>
        </TouchableOpacity>

        {/* Settings Toggles */}
        <View style={styles.togglesCard}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextCol}>
              <Text style={styles.toggleTitle}>Share live location</Text>
              <Text style={styles.toggleDesc}>While SOS is active</Text>
            </View>
            <Switch
              value={shareLiveLocation}
              onValueChange={setShareLiveLocation}
              trackColor={{ false: "#CBD5E1", true: "#EF4444" }}
              thumbColor={"#FFFFFF"}
            />
          </View>

          <View style={styles.separator} />

          <View style={styles.toggleRow}>
            <View style={styles.toggleTextCol}>
              <Text style={styles.toggleTitle}>Notify by SMS</Text>
              <Text style={styles.toggleDesc}>If the app is offline</Text>
            </View>
            <Switch
              value={notifyBySMS}
              onValueChange={setNotifyBySMS}
              trackColor={{ false: "#CBD5E1", true: "#EF4444" }}
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
  pageTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.textPrimary,
    letterSpacing: -0.4,
  },
  pageSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
    marginBottom: 18,
  },
  contactsList: {
    gap: 10,
    marginBottom: 16,
  },
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    ...SHADOWS.card,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#2563EB",
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  contactRelation: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  activePill: {
    backgroundColor: "#ECFDF5",
  },
  activePillText: {
    color: "#059669",
    fontSize: 11,
    fontWeight: "700",
  },
  pendingPill: {
    backgroundColor: "#FFFBEB",
  },
  pendingPillText: {
    color: "#D97706",
    fontSize: 11,
    fontWeight: "700",
  },
  addContactBtn: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#EF4444",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    backgroundColor: "#FFF5F5",
    marginBottom: 24,
  },
  addContactText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#EF4444",
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
