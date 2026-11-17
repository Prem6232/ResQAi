import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS } from "../../theme";
import { Role, UserProfile } from "../../types";
import { mobileApi } from "../../services/api";

interface AuthScreenProps {
  onAuthSuccess: (user: UserProfile, role: Role) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [selectedRole, setSelectedRole] = useState<Role>("citizen");

  // Form Fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [unitCode, setUnitCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSignIn = async (useEmail?: string, usePassword?: string) => {
    setErrorMsg(null);
    const targetEmail = useEmail || email;
    const targetPassword = usePassword || password;

    if (!targetEmail || !targetPassword) {
      setErrorMsg("Please enter both email address and password.");
      return;
    }

    setLoading(true);
    try {
      const res = await mobileApi.login(targetEmail, targetPassword);
      onAuthSuccess(res.user, res.user.role);
    } catch (e: any) {
      console.warn("Sign in error:", e);
      setErrorMsg(e?.message || "Invalid credentials or backend unreachable. Tap below for Demo quick login.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    setErrorMsg(null);
    if (!fullName.trim()) {
      setErrorMsg("Please enter your full name.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }
    if (!password || password.length < 8) {
      setErrorMsg("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);
    try {
      const res = await mobileApi.register({
        email,
        password,
        fullName,
        role: selectedRole,
        phone: phone.trim() || undefined,
        unitCode: selectedRole === "responder" ? unitCode.trim() || "UNIT-1" : undefined,
      });
      onAuthSuccess(res.user, selectedRole);
    } catch (e: any) {
      console.warn("Sign up error:", e);
      setErrorMsg(e?.message || "Failed to create account on backend. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = (role: Role) => {
    if (role === "citizen") {
      setEmail("citizen@campus.demo");
      setPassword("demo1234");
      handleSignIn("citizen@campus.demo", "demo1234");
    } else {
      setEmail("responder@campus.demo");
      setPassword("demo1234");
      handleSignIn("responder@campus.demo", "demo1234");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Branding & Logo */}
        <View style={styles.brandArea}>
          <Image
            source={require("../../../assets/logo-tight.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.brandTitle}>ResQAI</Text>
          <Text style={styles.brandTagline}>Bhopal Emergency Response & Safety Grid</Text>
          <View style={styles.liveApiBadge}>
            <View style={styles.pulseDot} />
            <Text style={styles.liveApiText}>Live Cloud Backend Connected</Text>
          </View>
        </View>

        {/* Tab Toggle: Sign In vs Sign Up */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabBtn, mode === "signin" && styles.tabBtnActive]}
            onPress={() => {
              setMode("signin");
              setErrorMsg(null);
            }}
          >
            <Text style={[styles.tabText, mode === "signin" && styles.tabTextActive]}>
              Sign In
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, mode === "signup" && styles.tabBtnActive]}
            onPress={() => {
              setMode("signup");
              setErrorMsg(null);
            }}
          >
            <Text style={[styles.tabText, mode === "signup" && styles.tabTextActive]}>
              Create Account
            </Text>
          </TouchableOpacity>
        </View>

        {/* Role Selector Pill */}
        <View style={styles.roleSelectorWrapper}>
          <Text style={styles.fieldLabel}>Select Role</Text>
          <View style={styles.roleRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.roleCard, selectedRole === "citizen" && styles.roleCardActiveCitizen]}
              onPress={() => setSelectedRole("citizen")}
            >
              <View style={[styles.roleIconBox, selectedRole === "citizen" && { backgroundColor: "#DBEAFE" }]}>
                <Feather
                  name="user"
                  size={18}
                  color={selectedRole === "citizen" ? "#2563EB" : "#64748B"}
                />
              </View>
              <View>
                <Text style={[styles.roleCardTitle, selectedRole === "citizen" && { color: "#2563EB" }]}>
                  Citizen
                </Text>
                <Text style={styles.roleCardDesc}>SOS beacons & reports</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.roleCard, selectedRole === "responder" && styles.roleCardActiveResponder]}
              onPress={() => setSelectedRole("responder")}
            >
              <View style={[styles.roleIconBox, selectedRole === "responder" && { backgroundColor: "#D1FAE5" }]}>
                <Feather
                  name="shield"
                  size={18}
                  color={selectedRole === "responder" ? "#059669" : "#64748B"}
                />
              </View>
              <View>
                <Text style={[styles.roleCardTitle, selectedRole === "responder" && { color: "#059669" }]}>
                  First Responder
                </Text>
                <Text style={styles.roleCardDesc}>Field dispatch & routing</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Error Banner */}
        {errorMsg && (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={16} color="#E11D48" />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        {/* Form Inputs */}
        <View style={styles.formSection}>
          {mode === "signup" && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <View style={styles.inputWrapper}>
                <Feather name="user" size={18} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Aisha Rahman"
                  placeholderTextColor="#94A3B8"
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                />
              </View>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <View style={styles.inputWrapper}>
              <Feather name="mail" size={18} color="#94A3B8" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="citizen@campus.demo"
                placeholderTextColor="#94A3B8"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          {mode === "signup" && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Mobile Phone (for Emergency SMS)</Text>
              <View style={styles.inputWrapper}>
                <Feather name="phone" size={18} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="+91 98765 43210"
                  placeholderTextColor="#94A3B8"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
              </View>
            </View>
          )}

          {mode === "signup" && selectedRole === "responder" && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Unit Code / Station</Text>
              <View style={styles.inputWrapper}>
                <Feather name="shield" size={18} color="#94A3B8" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. F-2 (Bhopal Central Station)"
                  placeholderTextColor="#94A3B8"
                  value={unitCode}
                  onChangeText={setUnitCode}
                  autoCapitalize="characters"
                />
              </View>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputWrapper}>
              <Feather name="lock" size={18} color="#94A3B8" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="At least 8 characters"
                placeholderTextColor="#94A3B8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
              >
                <Feather name={showPassword ? "eye" : "eye-off"} size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Submit Action Button */}
          <TouchableOpacity
            style={[styles.submitBtn, selectedRole === "responder" && styles.submitBtnResponder]}
            activeOpacity={0.85}
            onPress={() => (mode === "signin" ? handleSignIn() : handleSignUp())}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.submitBtnText}>
                  {mode === "signin" ? `Sign In as ${selectedRole === "responder" ? "Responder" : "Citizen"}` : "Create ResQAi Account"}
                </Text>
                <Feather name="arrow-right" size={18} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Quick Demo Credentials Strip */}
        <View style={styles.demoSection}>
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR 1-TAP DEMO LOGIN</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.demoPillsRow}>
            <TouchableOpacity
              style={styles.demoPill}
              activeOpacity={0.7}
              onPress={() => handleQuickDemoLogin("citizen")}
            >
              <View style={[styles.demoDot, { backgroundColor: "#2563EB" }]} />
              <Text style={styles.demoPillText}>Aisha Rahman (Citizen)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.demoPill, { borderColor: "#A7F3D0" }]}
              activeOpacity={0.7}
              onPress={() => handleQuickDemoLogin("responder")}
            >
              <View style={[styles.demoDot, { backgroundColor: "#059669" }]} />
              <Text style={[styles.demoPillText, { color: "#065F46" }]}>Unit F-2 (Responder)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 50,
    paddingBottom: 40,
  },
  brandArea: {
    alignItems: "center",
    marginBottom: 24,
  },
  logo: {
    width: 60,
    height: 60,
    marginBottom: 10,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.5,
  },
  brandTagline: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    fontWeight: "500",
  },
  liveApiBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 10,
    gap: 6,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#059669",
  },
  liveApiText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#065F46",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#E2E8F0",
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  tabBtnActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  tabTextActive: {
    color: "#0F172A",
    fontWeight: "800",
  },
  roleSelectorWrapper: {
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  roleRow: {
    flexDirection: "row",
    gap: 12,
  },
  roleCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  roleCardActiveCitizen: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  roleCardActiveResponder: {
    borderColor: "#059669",
    backgroundColor: "#ECFDF5",
  },
  roleIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  roleCardTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },
  roleCardDesc: {
    fontSize: 10,
    color: "#64748B",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFF1F2",
    borderWidth: 1,
    borderColor: "#FECDD3",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorText: {
    color: "#E11D48",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  formSection: {
    gap: 14,
  },
  inputGroup: {},
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A",
  },
  eyeBtn: {
    padding: 6,
  },
  submitBtn: {
    backgroundColor: "#2563EB",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    height: 50,
    borderRadius: 12,
    marginTop: 6,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  submitBtnResponder: {
    backgroundColor: "#059669",
    shadowColor: "#059669",
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  demoSection: {
    marginTop: 28,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#CBD5E1",
  },
  dividerText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.5,
  },
  demoPillsRow: {
    gap: 10,
  },
  demoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  demoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  demoPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E40AF",
  },
});
