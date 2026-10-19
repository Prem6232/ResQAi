import React, { useState } from "react";
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

  // App Data Store — empty defaults, will be populated via API
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [alerts, setAlerts] = useState<NearbyAlert[]>([]);
  const [reports, setReports] = useState<CitizenReport[]>([]);
  const [featuredJob, setFeaturedJob] = useState<ResponderJob | null>(null);
  const [resolvedJobs, setResolvedJobs] = useState<ResponderJob[]>([]);
  const [responderProfile, setResponderProfile] = useState<ResponderProfile>({
    unitCode: "",
    unitName: "",
    station: "",
    crewCount: 0,
    isOnDuty: false,
    availability: "off_duty",
    skills: [],
    shareLiveLocation: false,
    alertSound: true,
    todayJobsCount: 0,
    avgArrivalMinutes: 0,
    acceptanceRatePct: 0,
  });

  // New Citizen Report handler
  const handleCreateReport = (newRep: {
    category: IncidentCategory;
    title: string;
    text: string;
    locationLabel: string;
    voiceTranscript?: string;
  }) => {
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

    setReports([reportItem, ...reports]);
  };

  // Responder Job Offer Accept handler
  const handleAcceptJob = (job: ResponderJob) => {
    setFeaturedJob({
      ...job,
      status: "accepted",
    });
    // Immediately open Active Nav screen
    setResponderTab("nav");
  };

  // Responder Job Offer Decline handler
  const handleDeclineJob = (job: ResponderJob) => {
    setFeaturedJob(null);
  };

  // Responder On Scene Arrived
  const handleMarkArrived = () => {
    if (featuredJob) {
      setFeaturedJob({
        ...featuredJob,
        status: "arrived",
      });
    }
  };

  // Operator Verify & Dispatch
  const handleVerifyAndDispatch = () => {
    // Will be replaced with real API dispatch call
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
