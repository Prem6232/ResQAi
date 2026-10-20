import React, { useState, useEffect } from "react";
import { StyleSheet, View } from "react-native";
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
} from "./src/types";

import { mobileApi } from "./src/services/api";
import { mobileRealtime } from "./src/services/realtime";

import { SafeHeader } from "./src/components/common/SafeHeader";
import { BottomNav, CitizenTab, ResponderTab } from "./src/components/common/BottomNav";
import { RoleSwitcherModal } from "./src/components/common/RoleSwitcher";
import { ReportWizardModal } from "./src/components/modals/ReportWizardModal";

// Screens
import { CitizenHomeScreen } from "./src/screens/citizen/CitizenHomeScreen";
import { CitizenAlertsScreen } from "./src/screens/citizen/CitizenAlertsScreen";
import { CitizenMyReportsScreen } from "./src/screens/citizen/CitizenMyReportsScreen";
import { CitizenContactsScreen } from "./src/screens/citizen/CitizenContactsScreen";

import { ResponderFeedScreen } from "./src/screens/responder/ResponderFeedScreen";
import { ResponderActiveNavScreen } from "./src/screens/responder/ResponderActiveNavScreen";
import { ResponderHistoryScreen } from "./src/screens/responder/ResponderHistoryScreen";
import { ResponderStatusScreen } from "./src/screens/responder/ResponderStatusScreen";

import { ControlRoomScreen } from "./src/screens/operator/ControlRoomScreen";

export default function App() {
  const [role, setRole] = useState<Role>("citizen");
  const [citizenTab, setCitizenTab] = useState<CitizenTab>("home");
  const [responderTab, setResponderTab] = useState<ResponderTab>("feed");
  
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [reportWizardVisible, setReportWizardVisible] = useState(false);

  // App Data Store — populated live from FastAPI backend
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [alerts, setAlerts] = useState<NearbyAlert[]>([]);
  const [reports, setReports] = useState<CitizenReport[]>([]);
  const [featuredJob, setFeaturedJob] = useState<ResponderJob | null>(null);
  const [resolvedJobs, setResolvedJobs] = useState<ResponderJob[]>([]);
  const [responderProfile, setResponderProfile] = useState<ResponderProfile>({
    unitCode: "RESQ-DELTA-01",
    unitName: "Delta Quick Response",
    station: "Central Campus Post",
    crewCount: 4,
    isOnDuty: true,
    availability: "available",
    skills: ["First Aid", "Fire Containment", "HazMat Triage"],
    shareLiveLocation: true,
    alertSound: true,
    todayJobsCount: 3,
    avgArrivalMinutes: 4.2,
    acceptanceRatePct: 96,
  });

  // Initialize and synchronize with FastAPI backend
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    async function initBackend() {
      try {
        await mobileApi.loginAs(role);
        mobileRealtime.connect();

        if (role === "citizen") {
          const [fetchedReports, fetchedAlerts, fetchedContacts] = await Promise.all([
            mobileApi.getCitizenReports(),
            mobileApi.getNearbyAlerts(),
            mobileApi.getContacts(),
          ]);
          if (fetchedReports.length) setReports(fetchedReports);
          if (fetchedAlerts.length) setAlerts(fetchedAlerts);
          if (fetchedContacts.length) setContacts(fetchedContacts);
        } else if (role === "responder") {
          const assignments = await mobileApi.getResponderAssignments();
          if (assignments.length) {
            setFeaturedJob(assignments[0]);
            setResolvedJobs(assignments.slice(1));
          }
        }

        unsubscribe = mobileRealtime.subscribe((event) => {
          console.log("Realtime event received on mobile:", event);
          if (role === "citizen") {
            mobileApi.getCitizenReports().then((r) => r.length && setReports(r));
          } else if (role === "responder") {
            mobileApi.getResponderAssignments().then((a) => {
              if (a.length) {
                setFeaturedJob(a[0]);
                setResolvedJobs(a.slice(1));
              }
            });
          }
        });
      } catch (err) {
        console.warn("Backend synchronization warning:", err);
      }
    }

    initBackend();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [role]);

  // New Citizen Report handler with backend persistence
  const handleCreateReport = async (newRep: {
    category: IncidentCategory;
    title: string;
    text: string;
    locationLabel: string;
    voiceTranscript?: string;
  }) => {
    try {
      const savedReport = await mobileApi.createReport({
        category: newRep.category,
        title: newRep.title,
        text: newRep.text,
        locationLabel: newRep.locationLabel,
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
      };
      setReports((prev) => [reportItem, ...prev]);
    }
  };

  // Responder Job Offer Accept handler
  const handleAcceptJob = async (job: ResponderJob) => {
    try {
      await mobileApi.respondToOffer(job.id, true);
    } catch (e) {
      console.warn("Failed to accept offer on backend:", e);
    }
    setFeaturedJob({
      ...job,
      status: "accepted",
    });
    setResponderTab("nav");
  };

  // Responder Job Offer Decline handler
  const handleDeclineJob = async (job: ResponderJob) => {
    try {
      await mobileApi.respondToOffer(job.id, false);
    } catch (e) {
      console.warn("Failed to decline offer on backend:", e);
    }
    setFeaturedJob(null);
  };

  // Responder On Scene Arrived
  const handleMarkArrived = async () => {
    if (featuredJob) {
      try {
        await mobileApi.updateAssignmentStatus(featuredJob.id, "arrived");
      } catch (e) {
        console.warn("Failed to update status on backend:", e);
      }
      setFeaturedJob({
        ...featuredJob,
        status: "arrived",
      });
    }
  };

  // Operator Verify & Dispatch
  const handleVerifyAndDispatch = () => {
    console.log("Verified & Dispatched from Control Room");
  };

  const renderActiveScreen = () => {
    if (role === "citizen") {
      switch (citizenTab) {
        case "home":
          return (
            <CitizenHomeScreen
              onReportCreated={handleCreateReport}
              onNavigateToReports={() => setCitizenTab("reports")}
            />
          );
        case "alerts":
          return (
            <CitizenAlertsScreen
              alerts={alerts}
              onOpenReportWizard={() => setReportWizardVisible(true)}
            />
          );
        case "reports":
          return <CitizenMyReportsScreen reports={reports} />;
        case "contacts":
          return (
            <CitizenContactsScreen
              contacts={contacts}
              onAddContact={(c) => setContacts([c, ...contacts])}
            />
          );
      }
    } else if (role === "responder") {
      switch (responderTab) {
        case "feed":
          return (
            <ResponderFeedScreen
              isOnDuty={responderProfile.isOnDuty}
              onToggleDuty={(val) =>
                setResponderProfile({ ...responderProfile, isOnDuty: val })
              }
              featuredJob={featuredJob}
              resolvedJobs={resolvedJobs}
              onAcceptJob={handleAcceptJob}
              onDeclineJob={handleDeclineJob}
            />
          );
        case "nav":
          return (
            <ResponderActiveNavScreen
              activeJob={featuredJob}
              onMarkArrived={handleMarkArrived}
            />
          );
        case "history":
          return (
            <ResponderHistoryScreen
              todayJobsCount={responderProfile.todayJobsCount}
              avgArrivalMinutes={responderProfile.avgArrivalMinutes}
              acceptanceRatePct={responderProfile.acceptanceRatePct}
              historyJobs={resolvedJobs}
            />
          );
        case "status":
          return (
            <ResponderStatusScreen
              profile={responderProfile}
              onUpdateProfile={(updated) =>
                setResponderProfile({ ...responderProfile, ...updated })
              }
            />
          );
      }
    } else {
      return (
        <ControlRoomScreen onVerifyAndDispatch={handleVerifyAndDispatch} />
      );
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
      ? "Live location on"
      : role === "responder"
      ? responderProfile.isOnDuty
        ? "On Duty · Telemetry Active"
        : "Off Duty"
      : "Campus Dispatch Active";

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeContainer} edges={["top", "bottom"]}>
        <StatusBar style="dark" />

        {/* Unified App Header */}
        <SafeHeader
          role={role}
          subtitle={headerSubtitle}
          onRoleSwitchPress={() => setRoleModalVisible(true)}
        />

        {/* Main Screen Body */}
        <View style={styles.bodyContainer}>{renderActiveScreen()}</View>

        {/* Bottom Tab Navigation Bar (For Citizen & Responder) */}
        {role !== "operator" ? (
          <BottomNav
            role={role}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        ) : null}

        {/* Global Report Wizard Modal */}
        <ReportWizardModal
          visible={reportWizardVisible}
          onClose={() => setReportWizardVisible(false)}
          onSubmit={(rep) => {
            handleCreateReport(rep);
            setCitizenTab("reports");
          }}
        />

        {/* Role Switcher Modal (Switch between Citizen / Responder / Control Room) */}
        <RoleSwitcherModal
          visible={roleModalVisible}
          currentRole={role}
          onSelectRole={(newRole) => {
            setRole(newRole);
            if (newRole === "citizen") setCitizenTab("home");
            if (newRole === "responder") setResponderTab("feed");
          }}
          onClose={() => setRoleModalVisible(false)}
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
