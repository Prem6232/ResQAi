import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, SHADOWS } from "../../theme";
import { IncidentCategory } from "../../types";
import { runTextClassifier, runVoiceTranscription } from "../../services/mlBridge";

interface ReportWizardModalProps {
  visible: boolean;
  initialCategory?: IncidentCategory;
  onClose: () => void;
  onSubmit: (report: {
    category: IncidentCategory;
    title: string;
    text: string;
    locationLabel: string;
    voiceTranscript?: string;
  }) => void;
}

export const ReportWizardModal: React.FC<ReportWizardModalProps> = ({
  visible,
  initialCategory = "fire_smoke",
  onClose,
  onSubmit,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<IncidentCategory>(initialCategory);
  const [description, setDescription] = useState("");
  const [locationLabel, setLocationLabel] = useState("Market Road; near old bus stand");
  const [recording, setRecording] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);
  const [aiTag, setAiTag] = useState<{ label: string; confidence: number } | null>(null);

  const categories: Array<{ id: IncidentCategory; label: string }> = [
    { id: "fire_smoke", label: "Fire & Smoke" },
    { id: "road_accident", label: "Road Accident" },
    { id: "water_flood", label: "Flood / Water" },
    { id: "medical", label: "Medical" },
    { id: "personal_sos", label: "Personal SOS" },
    { id: "hazard", label: "Hazard" },
  ];

  const handleSimulateVoiceRecord = async () => {
    if (!recording) {
      setRecording(true);
      // Simulate 2 sec voice capture
      setTimeout(async () => {
        setRecording(false);
        const result = await runVoiceTranscription("dummy.wav");
        setVoiceTranscript(result.transcript);
        setDescription((prev) => (prev ? `${prev} · ${result.transcript}` : result.transcript));
        
        // Trigger AI text categorization
        const aiRes = await runTextClassifier(result.transcript);
        setSelectedCategory(aiRes.suggestedCategory);
        setAiTag({
          label: `${aiRes.suggestedCategory.replace("_", " ").toUpperCase()}`,
          confidence: Math.round(aiRes.modelConfidence * 100),
        });
      }, 2000);
    }
  };

  const handleSubmit = () => {
    const title =
      selectedCategory === "fire_smoke"
        ? "Fire & Smoke Report"
        : selectedCategory === "road_accident"
        ? "Road Collision / Accident"
        : selectedCategory === "medical"
        ? "Medical Emergency"
        : selectedCategory === "water_flood"
        ? "Waterlogged Road"
        : "Community Incident";

    onSubmit({
      category: selectedCategory,
      title,
      text: description || "Citizen emergency report submitted via SafeGuard App.",
      locationLabel,
      voiceTranscript: voiceTranscript || undefined,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Report Incident</Text>
              <Text style={styles.headerSubtitle}>
                AI Assisted Evidence Assessment
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            {/* Category Selector Pills */}
            <Text style={styles.sectionTitle}>SELECT CATEGORY</Text>
            <View style={styles.categoryGrid}>
              {categories.map((cat) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => setSelectedCategory(cat.id)}
                    style={[
                      styles.categoryChip,
                      isSelected && styles.categoryChipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        isSelected && styles.categoryChipTextSelected,
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Voice Audio Recording Simulation */}
            <Text style={[styles.sectionTitle, { marginTop: 18 }]}>
              VOICE NOTE (WHISPER AI ASSISTED)
            </Text>
            <View style={styles.voiceCard}>
              <TouchableOpacity
                onPress={handleSimulateVoiceRecord}
                style={[
                  styles.micButton,
                  recording && styles.micButtonRecording,
                ]}
              >
                <Feather
                  name={recording ? "mic-off" : "mic"}
                  size={22}
                  color={recording ? "#FFFFFF" : COLORS.sosPrimary}
                />
              </TouchableOpacity>
              <View style={styles.voiceInfo}>
                <Text style={styles.voiceTitle}>
                  {recording
                    ? "Listening and transcribing..."
                    : voiceTranscript
                    ? "Voice Transcribed (faster-whisper)"
                    : "Tap mic to speak voice description"}
                </Text>
                {voiceTranscript ? (
                  <Text style={styles.voiceText}>"{voiceTranscript}"</Text>
                ) : (
                  <Text style={styles.voiceHint}>
                    English, Hindi & Hinglish auto-transcribed
                  </Text>
                )}
              </View>
            </View>

            {/* Text Description */}
            <Text style={[styles.sectionTitle, { marginTop: 18 }]}>
              ADDITIONAL DETAILS
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder="Describe situation, people affected, smoke color..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              value={description}
              onChangeText={setDescription}
            />

            {/* AI Decision-Support Preview Banner */}
            {aiTag ? (
              <View style={styles.aiBadge}>
                <MaterialCommunityIcons
                  name="robot-outline"
                  size={18}
                  color="#2563EB"
                />
                <Text style={styles.aiBadgeText}>
                  AI Triage Suggestion: {aiTag.label} ({aiTag.confidence}% match)
                </Text>
              </View>
            ) : null}

            {/* Location Confirmation */}
            <Text style={[styles.sectionTitle, { marginTop: 18 }]}>
              INCIDENT LOCATION
            </Text>
            <View style={styles.locationBox}>
              <Feather name="map-pin" size={18} color={COLORS.sosPrimary} />
              <TextInput
                style={styles.locationInput}
                value={locationLabel}
                onChangeText={setLocationLabel}
              />
            </View>
          </ScrollView>

          {/* Submit Action */}
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={handleSubmit}
              activeOpacity={0.8}
              style={styles.submitBtn}
            >
              <Text style={styles.submitBtnText}>Submit Emergency Report</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "88%",
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.textSecondary,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryChip: {
    backgroundColor: COLORS.surfaceSubtle,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryChipSelected: {
    backgroundColor: "#FFE4E6",
    borderColor: COLORS.sosPrimary,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  categoryChipTextSelected: {
    color: COLORS.sosPrimary,
    fontWeight: "700",
  },
  voiceCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
  },
  micButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#FFE4E6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  micButtonRecording: {
    backgroundColor: COLORS.sosPrimary,
  },
  voiceInfo: {
    flex: 1,
  },
  voiceTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  voiceText: {
    fontSize: 12,
    fontStyle: "italic",
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  voiceHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  textInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 14,
    fontSize: 13,
    color: COLORS.textPrimary,
    minHeight: 70,
    textAlignVertical: "top",
  },
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 10,
    gap: 8,
  },
  aiBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E40AF",
  },
  locationBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  locationInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 10,
  },
  submitBtn: {
    backgroundColor: COLORS.sosPrimary,
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
    ...SHADOWS.card,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
