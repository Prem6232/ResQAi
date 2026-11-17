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
  const [role, setRole] = useState<Role>("citizen");
  const [citizenTab, setCitizenTab] = useState<CitizenTab>("home");
  const [responderTab, setResponderTab] = useState<ResponderTab>("feed");

  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [reportWizardVisible, setReportWizardVisible] = useState(false);

  // App Data Store — synchronized with live FastAPI backend
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [alerts, setAlerts] = useState<NearbyAlert[]>([]);
  const [reports, setReports] = useState<CitizenReport[]>([]);
  const [featuredJob, setFeaturedJob] = useState<ResponderJob | null>(null);
  const [resolvedJobs, setResolvedJobs] = useState<ResponderJob[]>([]);
  const [responderProfile, setResponderProfile] = useState<ResponderProfile>({
    unitCode: "F-2",
    unitName: "Fire Unit F-2",
    station: "Northridge Central Station",
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

  // Fetch role-specific data from backend
  const refreshRoleData = async (activeRole: Role) => {
    try {
      await mobileApi.loginAs(activeRole);

      if (activeRole === "citizen") {
        const [fetchedReports, fetchedAlerts, fetchedContacts] = await Promise.all([
          mobileApi.getCitizenReports(),
          mobileApi.getNearbyAlerts({ lat: 28.5452, lng: 77.2731 }),
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
        if (assignments.length) {
          setFeaturedJob(assignments[0]);
          setResolvedJobs(assignments.slice(1).concat(history));
        } else if (history.length) {
          setResolvedJobs(history);
        }
      }
    } catch (e) {
      console.warn("Backend data refresh warning:", e);
    }
  };

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    refreshRoleData(role);
    mobileRealtime.connect();

    unsubscribe = mobileRealtime.subscribe((event) => {
      console.log("Realtime event received on mobile:", event);
      if (role === "citizen") {
        mobileApi.getCitizenReports().then((r) => r.length && setReports(r));
        mobileApi.getNearbyAlerts().then((a) => a.length && setAlerts(a));
      } else {
        mobileApi.getResponderAssignments().then((a) => {
          if (a.length) {
            setFeaturedJob(a[0]);
            setResolvedJobs(a.slice(1));
          }
        });
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [role]);

  // Citizen Report Creation handler
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

  // Responder Mission Completed
  const handleMarkCompleted = async () => {
    if (featuredJob) {
      setResolvedJobs((prev) => [{ ...featuredJob, status: "completed" }, ...prev]);
      setFeaturedJob(null);
      setResponderTab("feed");
    }
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
              isOnDuty={responderProfile.isOnDuty}
              onToggleDuty={handleToggleDuty}
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
              onMarkCompleted={handleMarkCompleted}
            />
          );
        case "history":
          return (
            <ResponderHistoryScreen
              todayJobsCount={responderProfile.todayJobsCount}
              avgArrivalMinutes={responderProfile.avgArrivalMinutes}
              acceptanceRatePct={responderProfile.acceptanceRatePct}
              historyJobs={resolvedJobs}
              onRefresh={() => mobileApi.getResponderHistory().then(setResolvedJobs)}
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
      : responderProfile.isOnDuty
      ? "On Duty · Telemetry Active"
      : "Off Duty";

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

        {/* Role Switcher Modal (Citizen <-> First Responder) */}
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
