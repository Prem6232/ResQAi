import React, { useState, useEffect, useRef, useCallback } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "./src/theme";
import {
  Role,
  IncidentCategory,
  CitizenReport,
  NearbyAlert,
  ResponderJob,
  ResponderProfile,
  TrustedContact,
  UserProfile,
  GeoPoint,
} from "./src/types";

import { mobileApi } from "./src/services/api";
import { mobileRealtime } from "./src/services/realtime";
import { mobileLocation, BHOPAL_CITY_FALLBACK } from "./src/services/location";

import { SafeHeader } from "./src/components/common/SafeHeader";
import { BottomNav, CitizenTab, ResponderTab } from "./src/components/common/BottomNav";
import { RoleSwitcherModal } from "./src/components/common/RoleSwitcher";
import { ReportWizardModal } from "./src/components/modals/ReportWizardModal";
import { PermissionsModal } from "./src/components/modals/PermissionsModal";
import { AuthScreen } from "./src/screens/auth/AuthScreen";

// Screens for Citizen and Responder
import { CitizenHomeScreen } from "./src/screens/citizen/CitizenHomeScreen";
import { CitizenAlertsScreen } from "./src/screens/citizen/CitizenAlertsScreen";
import { CitizenMyReportsScreen } from "./src/screens/citizen/CitizenMyReportsScreen";
import { CitizenContactsScreen } from "./src/screens/citizen/CitizenContactsScreen";

import { ResponderFeedScreen } from "./src/screens/responder/ResponderFeedScreen";
import { ResponderActiveNavScreen } from "./src/screens/responder/ResponderActiveNavScreen";
import { ResponderHistoryScreen } from "./src/screens/responder/ResponderHistoryScreen";
import { ResponderStatusScreen } from "./src/screens/responder/ResponderStatusScreen";

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [permissionsModalVisible, setPermissionsModalVisible] = useState<boolean>(false);

  const [role, setRole] = useState<Role>("citizen");
  const [citizenTab, setCitizenTab] = useState<CitizenTab>("home");
  const [responderTab, setResponderTab] = useState<ResponderTab>("feed");

  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [reportWizardVisible, setReportWizardVisible] = useState(false);

  // Real Hardware GPS Location State — unlocked and updated in real-time
  const [deviceLocation, setDeviceLocation] = useState<GeoPoint>(BHOPAL_CITY_FALLBACK);
  const deviceLocationRef = useRef<GeoPoint>(BHOPAL_CITY_FALLBACK);
  const [isRealGPS, setIsRealGPS] = useState<boolean>(false);

  useEffect(() => {
    deviceLocationRef.current = deviceLocation;
  }, [deviceLocation]);

  // App Data Store — synchronized with live FastAPI backend
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [alerts, setAlerts] = useState<NearbyAlert[]>([]);
  const [reports, setReports] = useState<CitizenReport[]>([]);
  const [featuredJob, setFeaturedJob] = useState<ResponderJob | null>(null);
  const [resolvedJobs, setResolvedJobs] = useState<ResponderJob[]>([]);
  const [responderProfile, setResponderProfile] = useState<ResponderProfile>({
    unitCode: "F-2",
    unitName: "Fire Unit F-2",
    station: "Bhopal Central Emergency Station",
    crewCount: 4,
    isOnDuty: true,
    availability: "available",
    skills: ["First Aid", "Firefighting", "Rescue Operations"],
    shareLiveLocation: true,
    alertSound: true,
    todayJobsCount: 4,
    avgArrivalMinutes: 3.5,
    acceptanceRatePct: 98,
  });

  // Fetch role-specific data from backend using live GPS coordinates
  const refreshRoleData = async (activeRole: Role, loc: GeoPoint = deviceLocation) => {
    try {
      if (activeRole === "citizen") {
        const [fetchedReports, fetchedAlerts, fetchedContacts] = await Promise.all([
          mobileApi.getCitizenReports(),
          mobileApi.getNearbyAlerts(loc),
          mobileApi.getContacts(),
        ]);
        if (fetchedReports) setReports(fetchedReports);
        if (fetchedAlerts) setAlerts(fetchedAlerts);
        if (fetchedContacts) setContacts(fetchedContacts);
      } else {
        const [assignments, history, prof] = await Promise.all([
          mobileApi.getResponderAssignments(),
          mobileApi.getResponderHistory(),
          mobileApi.getResponderProfile(),
        ]);

        if (prof) setResponderProfile(prof);
        setFeaturedJob(assignments[0] ?? null);
        setResolvedJobs(history);
      }
    } catch (e) {
      console.warn("Backend data refresh warning:", e);
    }
  };

  const handleAuthSuccess = (user: UserProfile, newRole: Role) => {
    setCurrentUser(user);
    setRole(newRole);
    setCitizenTab("home");
    setResponderTab("feed");
    setIsAuthenticated(true);
    setPermissionsModalVisible(true);
    refreshRoleData(newRole, deviceLocationRef.current);
  };

  const handleLogout = useCallback(() => {
    mobileRealtime.disconnect();
    mobileApi.logout();
    setCurrentUser(null);
    setIsAuthenticated(false);
    setRole("citizen");
    setCitizenTab("home");
    setResponderTab("feed");
    setContacts([]);
    setAlerts([]);
    setReports([]);
    setFeaturedJob(null);
    setResolvedJobs([]);
  }, []);

  useEffect(() => {
    return mobileApi.onAuthExpired(() => {
      handleLogout();
    });
  }, [handleLogout]);

  const handleSelectRole = async (newRole: Role) => {
    if (newRole === role) return;

    const isDemoAccount = Boolean(currentUser?.email?.endsWith("@campus.demo"));
    if (isDemoAccount) {
      try {
        mobileRealtime.disconnect();
        const res = await mobileApi.loginAs(newRole);
        setCurrentUser(res.user);
        setRole(newRole);
        setCitizenTab("home");
        setResponderTab("feed");
        mobileRealtime.connect();
        await refreshRoleData(newRole, deviceLocationRef.current);
      } catch {
        Alert.alert("Role Switch Failed", "Could not switch demo session on backend.");
      }
      return;
    }

    if (currentUser && currentUser.role !== newRole) {
      Alert.alert(
        "Sign Out Required",
        `Your current session (${currentUser.email}) only has ${currentUser.role} permissions. Sign out to switch to ${newRole} mode.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Sign Out", style: "destructive", onPress: handleLogout },
        ]
      );
      return;
    }

    setRole(newRole);
    if (newRole === "citizen") setCitizenTab("home");
    if (newRole === "responder") setResponderTab("feed");
  };

  // Real device GPS tracking subscriber — tracks actual hardware coordinates
  useEffect(() => {
    let unsubscribeLocation: (() => void) | null = null;

    const startLocationTracking = async () => {
      // 1. Initial GPS lock
      const initial = await mobileLocation.getCurrentLocation();
      if (initial) {
        deviceLocationRef.current = initial;
        setDeviceLocation(initial);
        setIsRealGPS(true);
      }

      // 2. Watch position continuously as user moves
      unsubscribeLocation = await mobileLocation.startLiveTracking((coords) => {
        deviceLocationRef.current = coords;
        setDeviceLocation(coords);
        setIsRealGPS(true);
      });
    };

    startLocationTracking();

    return () => {
      if (unsubscribeLocation) unsubscribeLocation();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      mobileRealtime.disconnect();
      return;
    }

    refreshRoleData(role, deviceLocationRef.current);
    mobileRealtime.connect();

    const unsubscribe = mobileRealtime.subscribe((event) => {
      console.log("Realtime event received on mobile:", event);
      if (role === "citizen") {
        mobileApi.getCitizenReports().then(setReports);
        mobileApi.getNearbyAlerts(deviceLocationRef.current).then(setAlerts);
      } else {
        mobileApi.getResponderAssignments().then((a) => {
          setFeaturedJob(a[0] ?? null);
        });
        mobileApi.getResponderHistory().then((h) => {
          setResolvedJobs(h);
        });
      }
    });

    return () => {
      unsubscribe();
      mobileRealtime.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, isAuthenticated]);

  // Citizen Report Creation handler (skips duplicate POST if report already saved by SOS)
  const handleCreateReport = async (
    newRep:
      | CitizenReport
      | {
          category: IncidentCategory;
          title: string;
          text: string;
          locationLabel: string;
          voiceTranscript?: string;
        }
  ) => {
    if (!("text" in newRep)) {
      setReports((prev) => [newRep, ...prev.filter((r) => r.id !== newRep.id)]);
      return;
    }
    try {
      const savedReport = await mobileApi.createReport({
        category: newRep.category,
        title: newRep.title,
        text: newRep.text,
        locationLabel: newRep.locationLabel,
        voiceTranscript: newRep.voiceTranscript,
        channel: newRep.voiceTranscript ? "voice" : undefined,
        lat: deviceLocation.lat,
        lng: deviceLocation.lng,
      });
      setReports((prev) => [savedReport, ...prev]);
    } catch (e) {
      console.warn("Failed to create report on backend, using fallback", e);
      const reportItem: CitizenReport = {
        id: `rep_${Date.now()}`,
        title: newRep.title,
        category: newRep.category,
        timestamp: "Just now",
        status: "in_review",
        statusLabel: "In review",
        currentStep: 2,
        stepDetails: "Received by control room. Triage & proximity matching in progress.",
        locationLabel: newRep.locationLabel,
        voiceTranscript: newRep.voiceTranscript,
        location: { lat: deviceLocation.lat, lng: deviceLocation.lng },
      };
      setReports((prev) => [reportItem, ...prev]);
    }
  };

  // Contact Handlers
  const handleAddContact = async (contactInput: { name: string; phone: string; relation: string }) => {
    const saved = await mobileApi.addContact(contactInput);
    setContacts((prev) => [saved, ...prev]);
  };

  const handleDeleteContact = async (id: string) => {
    await mobileApi.deleteContact(id);
    setContacts((prev) => prev.filter((c) => c.id !== id));
  };

  // Duty Toggle Handler
  const handleToggleDuty = async (val: boolean) => {
    setResponderProfile((prev) => ({
      ...prev,
      isOnDuty: val,
      availability: val ? "available" : "off_duty",
    }));
    try {
      await mobileApi.updateDuty(val, val ? "available" : "off_duty");
    } catch (e) {
      console.warn("Duty toggle sync warning", e);
    }
  };

  // Responder Job Offer Accept handler
  const handleAcceptJob = async (job: ResponderJob) => {
    try {
      await mobileApi.respondToOffer(job.id, true);
      setFeaturedJob({
        ...job,
        status: "accepted",
      });
      setResponderTab("nav");
    } catch (e) {
      console.warn("Failed to accept offer on backend:", e);
      Alert.alert("Offer Sync Error", "Could not accept dispatch offer. It may have expired.");
    }
  };

  // Responder Job Offer Decline handler
  const handleDeclineJob = async (job: ResponderJob) => {
    try {
      await mobileApi.respondToOffer(job.id, false);
      setFeaturedJob(null);
      const history = await mobileApi.getResponderHistory();
      setResolvedJobs(history);
    } catch (e) {
      console.warn("Failed to decline offer on backend:", e);
      Alert.alert("Offer Sync Error", "Could not decline dispatch offer on server.");
    }
  };

  // Responder En Route Transition
  const handleMarkEnRoute = () => {
    setFeaturedJob((prev) => (prev ? { ...prev, status: "en_route" } : null));
  };

  // Responder On Scene Arrived
  const handleMarkArrived = () => {
    setFeaturedJob((prev) => (prev ? { ...prev, status: "arrived" } : null));
  };

  // Responder Mission Completed
  const handleMarkCompleted = async () => {
    if (featuredJob) {
      setResolvedJobs((prev) => [{ ...featuredJob, status: "completed" }, ...prev]);
      setFeaturedJob(null);
      setResponderTab("feed");
      try {
        const [assignments, history] = await Promise.all([
          mobileApi.getResponderAssignments(),
          mobileApi.getResponderHistory(),
        ]);
        setFeaturedJob(assignments[0] ?? null);
        setResolvedJobs(history);
      } catch (e) {
        console.warn("Failed to refresh responder history:", e);
      }
    }
  };

  const renderActiveScreen = () => {
    if (role === "citizen") {
      switch (citizenTab) {
        case "home":
          return (
            <CitizenHomeScreen
              currentLocation={deviceLocation}
              onReportCreated={handleCreateReport}
              onNavigateToReports={() => setCitizenTab("reports")}
            />
          );
        case "alerts":
          return (
            <CitizenAlertsScreen
              currentLocation={deviceLocation}
              alerts={alerts}
              onOpenReportWizard={() => setReportWizardVisible(true)}
            />
          );
        case "reports":
          return (
            <CitizenMyReportsScreen
              reports={reports}
              onRefresh={() => mobileApi.getCitizenReports().then(setReports)}
              onOpenReportWizard={() => setReportWizardVisible(true)}
            />
          );
        case "contacts":
          return (
            <CitizenContactsScreen
              contacts={contacts}
              onAddContact={handleAddContact}
              onDeleteContact={handleDeleteContact}
            />
          );
      }
    } else {
      switch (responderTab) {
        case "feed":
          return (
            <ResponderFeedScreen
              currentLocation={deviceLocation}
              isOnDuty={responderProfile.isOnDuty}
              onToggleDuty={handleToggleDuty}
              featuredJob={featuredJob}
              resolvedJobs={resolvedJobs}
              onAcceptJob={handleAcceptJob}
              onDeclineJob={handleDeclineJob}
              unitCode={responderProfile.unitCode}
              unitName={responderProfile.unitName}
            />
          );
        case "nav":
          return (
            <ResponderActiveNavScreen
              currentLocation={deviceLocation}
              activeJob={featuredJob}
              onMarkEnRoute={handleMarkEnRoute}
              onMarkArrived={handleMarkArrived}
              onMarkCompleted={handleMarkCompleted}
              unitCode={responderProfile.unitCode}
              unitName={responderProfile.unitName}
            />
          );
        case "history":
          return (
            <ResponderHistoryScreen
              todayJobsCount={responderProfile.todayJobsCount || resolvedJobs.length}
              avgArrivalMinutes={responderProfile.avgArrivalMinutes}
              acceptanceRatePct={responderProfile.acceptanceRatePct}
              historyJobs={resolvedJobs}
              unitLabel={`${responderProfile.unitName} (${responderProfile.unitCode}) · ${responderProfile.station}`}
              onRefresh={() => mobileApi.getResponderHistory().then(setResolvedJobs)}
            />
          );
        case "status":
          return (
            <ResponderStatusScreen
              currentLocation={deviceLocation}
              profile={responderProfile}
              onUpdateProfile={(updated) =>
                setResponderProfile({ ...responderProfile, ...updated })
              }
            />
          );
      }
    }
  };

  const activeTab = role === "responder" ? responderTab : citizenTab;
  const handleTabChange = (t: any) => {
    if (role === "responder") {
      setResponderTab(t);
    } else {
      setCitizenTab(t);
    }
  };

  const headerSubtitle =
    role === "citizen"
      ? isRealGPS
        ? `📍 GPS ${deviceLocation.lat.toFixed(4)}, ${deviceLocation.lng.toFixed(4)}`
        : "Acquiring GPS Signal..."
      : responderProfile.isOnDuty
      ? isRealGPS
        ? `On Duty · GPS ${deviceLocation.lat.toFixed(4)}, ${deviceLocation.lng.toFixed(4)}`
        : "On Duty · Telemetry Active"
      : "Off Duty";

  if (!isAuthenticated) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeContainer} edges={["top", "bottom"]}>
          <StatusBar style="dark" />
          <AuthScreen onAuthSuccess={handleAuthSuccess} />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeContainer} edges={["top", "bottom"]}>
        <StatusBar style="dark" />

        {/* Unified App Header with Role Switcher (Citizen <-> First Responder) */}
        <SafeHeader
          role={role}
          subtitle={headerSubtitle}
          onRoleSwitchPress={() => setRoleModalVisible(true)}
        />

        {/* Main Screen Body */}
        <View style={styles.bodyContainer}>{renderActiveScreen()}</View>

        {/* Bottom Tab Navigation Bar */}
        <BottomNav
          role={role}
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />

        {/* Global Report Creation Wizard Modal */}
        <ReportWizardModal
          visible={reportWizardVisible}
          onClose={() => setReportWizardVisible(false)}
          onSubmit={(rep) => {
            handleCreateReport(rep);
            setCitizenTab("reports");
          }}
        />

        {/* Role Switcher & Account Modal (Citizen <-> First Responder) */}
        <RoleSwitcherModal
          visible={roleModalVisible}
          currentRole={role}
          currentUser={currentUser}
          onLogout={handleLogout}
          onSelectRole={(newRole) => {
            void handleSelectRole(newRole);
          }}
          onClose={() => setRoleModalVisible(false)}
        />

        {/* Device Permissions Onboarding Modal */}
        <PermissionsModal
          visible={permissionsModalVisible}
          onComplete={() => setPermissionsModalVisible(false)}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  bodyContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
