import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { RoleBasedRoute } from "./RoleBasedRoute";
import { LandingPage } from "@/pages/LandingPage";
import { LoginPage } from "@/pages/auth/LoginPage";
import { RegisterPage } from "@/pages/auth/RegisterPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { UnauthorizedPage } from "@/pages/UnauthorizedPage";
import { CitizenDashboard } from "@/pages/citizen/CitizenDashboard";
import { CitizenAlertsPage } from "@/pages/citizen/CitizenAlertsPage";
import { MyReportsHistoryPage } from "@/pages/citizen/MyReportsHistoryPage";
import { CitizenContactsPage } from "@/pages/citizen/CitizenContactsPage";
import { SOSSubmitPage } from "@/pages/citizen/SOSSubmitPage";
import { DetailedReportPage } from "@/pages/citizen/DetailedReportPage";
import { ReportReceiptPage } from "@/pages/citizen/ReportReceiptPage";
import { SettingsPrivacyPage } from "@/pages/citizen/SettingsPrivacyPage";
import { ResponderDashboard } from "@/pages/responder/ResponderDashboard";
import { ResponderTaskView } from "@/pages/responder/ResponderTaskView";
import { ResponderHistoryPage } from "@/pages/responder/ResponderHistoryPage";
import { ResponderStatusPage } from "@/pages/responder/ResponderStatusPage";
import { OperatorCommandCenter } from "@/pages/operator/OperatorCommandCenter";
import { OperatorRespondersPage } from "@/pages/operator/OperatorRespondersPage";
import { OperatorAnalyticsPage } from "@/pages/operator/OperatorAnalyticsPage";
import { OperatorAuditPage } from "@/pages/operator/OperatorAuditPage";
import { OperatorSettingsPage } from "@/pages/operator/OperatorSettingsPage";
import { IncidentWorkspacePage } from "@/pages/operator/IncidentWorkspacePage";
import { DuplicateMergeReviewPage } from "@/pages/operator/DuplicateMergeReviewPage";
import { AdminDashboard } from "@/pages/admin/AdminDashboard";
import { ResponderManagementPage } from "@/pages/admin/ResponderManagementPage";
import { GeofenceConfigPage } from "@/pages/admin/GeofenceConfigPage";
import { SecurityAuditPage } from "@/pages/admin/SecurityAuditPage";
import { OperationalAnalyticsPage } from "@/pages/admin/OperationalAnalyticsPage";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<RoleBasedRoute roles={["citizen"]} mobile="citizen" />}>
            <Route path="/citizen" element={<CitizenDashboard />} />
            <Route path="/citizen/alerts" element={<CitizenAlertsPage />} />
            <Route path="/citizen/reports" element={<MyReportsHistoryPage />} />
            <Route path="/citizen/reports/:id" element={<ReportReceiptPage />} />
            <Route path="/citizen/contacts" element={<CitizenContactsPage />} />
            <Route path="/citizen/sos" element={<SOSSubmitPage />} />
            <Route path="/citizen/report/new" element={<DetailedReportPage />} />
            <Route path="/citizen/privacy" element={<SettingsPrivacyPage />} />
          </Route>
          <Route element={<RoleBasedRoute roles={["responder"]} mobile="responder" />}>
            <Route path="/responder" element={<ResponderDashboard />} />
            <Route path="/responder/active" element={<ResponderTaskView />} />
            <Route path="/responder/history" element={<ResponderHistoryPage />} />
            <Route path="/responder/status" element={<ResponderStatusPage />} />
          </Route>
          <Route element={<RoleBasedRoute roles={["operator"]} />}>
            <Route path="/operator" element={<OperatorCommandCenter />} />
            <Route path="/operator/responders" element={<OperatorRespondersPage />} />
            <Route path="/operator/analytics" element={<OperatorAnalyticsPage />} />
            <Route path="/operator/audit" element={<OperatorAuditPage />} />
            <Route path="/operator/settings" element={<OperatorSettingsPage />} />
            <Route path="/operator/incidents/:id" element={<IncidentWorkspacePage />} />
            <Route path="/operator/duplicates" element={<DuplicateMergeReviewPage />} />
          </Route>
          <Route element={<RoleBasedRoute roles={["admin"]} />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/responders" element={<ResponderManagementPage />} />
            <Route path="/admin/geofence" element={<GeofenceConfigPage />} />
            <Route path="/admin/audit" element={<SecurityAuditPage />} />
            <Route path="/admin/analytics" element={<OperationalAnalyticsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
