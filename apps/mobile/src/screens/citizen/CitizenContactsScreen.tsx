import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { COLORS, SHADOWS } from "../../theme";
import { TrustedContact } from "../../types";

interface CitizenContactsScreenProps {
  contacts: TrustedContact[];
  onAddContact: (contact: { name: string; phone: string; relation: string }) => Promise<void>;
  onDeleteContact?: (id: string) => Promise<void>;
}

export const CitizenContactsScreen: React.FC<CitizenContactsScreenProps> = ({
  contacts,
  onAddContact,
  onDeleteContact,
}) => {
  const [shareLiveLocation, setShareLiveLocation] = useState(true);
  const [notifyBySMS, setNotifyBySMS] = useState(true);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState("Friend");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isMaxReached = contacts.length >= 3;

  const handleOpenAdd = () => {
    if (isMaxReached) {
      Alert.alert(
        "Maximum Contacts Limit",
        "Campus safety policy limits trusted emergency contacts to 3 per account to ensure high-priority dispatch delivery. Please remove an existing contact to add a new one."
      );
      return;
    }
    setName("");
    setPhone("+91 ");
    setRelation("Friend");
    setModalVisible(true);
  };

  const handleSaveContact = async () => {
    if (!name.trim()) {
      Alert.alert("Missing Name", "Please enter the contact's name.");
      return;
    }
    if (!phone.trim() || phone.length < 8) {
      Alert.alert("Invalid Phone", "Please enter a valid phone number.");
      return;
    }

    try {
      setIsSubmitting(true);
      await onAddContact({ name: name.trim(), phone: phone.trim(), relation });
      setModalVisible(false);
    } catch (e: any) {
      Alert.alert("Error Saving Contact", e?.message || "Could not save trusted contact.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (contact: TrustedContact) => {
    Alert.alert(
      "Remove Contact",
      `Are you sure you want to remove ${contact.name} from your trusted emergency circle?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            if (onDeleteContact) {
              await onDeleteContact(contact.id);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>Trusted contacts</Text>
          <View style={[styles.quotaPill, isMaxReached && styles.quotaPillFull]}>
            <Text style={[styles.quotaText, isMaxReached && styles.quotaTextFull]}>
              {contacts.length} / 3 Configured
            </Text>
          </View>
        </View>

        <Text style={styles.pageSubtitle}>
          They receive automated SMS notices with your live GPS location beacon when you trigger emergency SOS.
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
                  <Text style={styles.contactRelation}>
                    {contact.relation} · {contact.phone}
                  </Text>
                </View>

                <View style={styles.rightActionRow}>
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

                  {onDeleteContact && (
                    <TouchableOpacity
                      onPress={() => handleDelete(contact)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.deleteBtn}
                    >
                      <Feather name="trash-2" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Add Contact Button */}
        <TouchableOpacity
          onPress={handleOpenAdd}
          activeOpacity={0.7}
          style={[styles.addContactBtn, isMaxReached && styles.addContactBtnDisabled]}
        >
          <Feather
            name="user-plus"
            size={18}
            color={isMaxReached ? "#94A3B8" : "#0F172A"}
            style={{ marginRight: 8 }}
          />
          <Text style={[styles.addContactText, isMaxReached && styles.addContactTextDisabled]}>
            {isMaxReached ? "Maximum 3 Contacts Configured" : "Add trusted contact"}
          </Text>
        </TouchableOpacity>

        {/* Settings Block */}
        <View style={styles.settingsSection}>
          <Text style={styles.sectionHeading}>Emergency preferences</Text>

          <View style={styles.settingCard}>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Share live GPS with contacts</Text>
              <Text style={styles.settingSub}>
                Sends map coordinate pin to trusted contacts during SOS
              </Text>
            </View>
            <Switch
              value={shareLiveLocation}
              onValueChange={setShareLiveLocation}
              trackColor={{ false: "#CBD5E1", true: "#10B981" }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.settingCard}>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>Automated SMS dispatch</Text>
              <Text style={styles.settingSub}>
                Sends instant SMS alerts when campus security desk is dispatched
              </Text>
            </View>
            <Switch
              value={notifyBySMS}
              onValueChange={setNotifyBySMS}
              trackColor={{ false: "#CBD5E1", true: "#10B981" }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>
      </ScrollView>

      {/* Add Contact Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Trusted Contact</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Feather name="x" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Full Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Rahul Sharma"
              placeholderTextColor="#94A3B8"
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.inputLabel}>Phone Number</Text>
            <TextInput
              style={styles.textInput}
              placeholder="+91 98765 43210"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />

            <Text style={styles.inputLabel}>Relationship</Text>
            <View style={styles.relationPillRow}>
              {["Family", "Friend", "Roommate", "Colleague"].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.relationPill, relation === r && styles.relationPillActive]}
                  onPress={() => setRelation(r)}
                >
                  <Text style={[styles.relationPillText, relation === r && styles.relationPillTextActive]}>
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveModalBtn}
                onPress={handleSaveContact}
                disabled={isSubmitting}
              >
                <Text style={styles.saveModalBtnText}>
                  {isSubmitting ? "Saving..." : "Save Contact"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingBottom: 28,
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
  quotaPill: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  quotaPillFull: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FDE68A",
  },
  quotaText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
  },
  quotaTextFull: {
    color: "#B45309",
  },
  pageSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 4,
    marginBottom: 16,
  },
  contactsList: {
    gap: 10,
  },
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderRadius: 16,
    ...SHADOWS.card,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2563EB",
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  contactRelation: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  rightActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activePill: {
    backgroundColor: "#DCFCE7",
  },
  pendingPill: {
    backgroundColor: "#FEF9C3",
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  activePillText: {
    color: "#16A34A",
  },
  pendingPillText: {
    color: "#CA8A04",
  },
  deleteBtn: {
    padding: 4,
  },
  addContactBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    ...SHADOWS.card,
  },
  addContactBtnDisabled: {
    backgroundColor: "#F1F5F9",
    borderColor: "#E2E8F0",
  },
  addContactText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  addContactTextDisabled: {
    color: "#94A3B8",
  },
  settingsSection: {
    marginTop: 24,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
  settingCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    ...SHADOWS.card,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  settingText: {
    flex: 1,
    marginRight: 12,
  },
  settingTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  settingSub: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    ...SHADOWS.cardHover,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
    marginTop: 10,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0F172A",
  },
  relationPillRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    marginBottom: 16,
  },
  relationPill: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  relationPillActive: {
    backgroundColor: "#0F172A",
  },
  relationPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
  },
  relationPillTextActive: {
    color: "#FFFFFF",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  cancelModalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  cancelModalBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  saveModalBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#0F172A",
    alignItems: "center",
  },
  saveModalBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
