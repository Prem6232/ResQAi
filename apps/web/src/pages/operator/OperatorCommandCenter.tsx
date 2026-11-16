import { CommandShell } from "@/components/common/CommandShell";
import { LiveQueueTable } from "@/features/operator/components/LiveQueueTable";
import { LiveResponderMap } from "@/components/maps/LiveResponderMap";
import {
  mockApi,
  type AnalyticsSummary,
  type DispatchRecommendation,
  type IncidentDetail,
} from "@/lib/mock-api";
import { useState, useEffect, useCallback, useRef } from "react";
import type { Incident } from "@/types/incident";
import type { ResponderProfile } from "@/types/responder";
import { FireSmokeEvidenceCard } from "@/components/evidence/FireSmokeEvidenceCard";
import { Button } from "@/components/ui/button";
import { HumanOversightReviewModal } from "@/features/operator/components/HumanOversightReviewModal";
import { DuplicateResolutionPanel } from "@/features/operator/components/DuplicateResolutionPanel";
import { OperatorOverrideControl } from "@/features/operator/components/OperatorOverrideControl";
import { Link } from "react-router-dom";
import { routes } from "@/config/routes.config";
import { useLiveEvents } from "@/hooks/useLiveEvents";
import { useToast } from "@/hooks/useToast";
import { playAlertChime } from "@/lib/audioAlerts";

export function OperatorCommandCenter() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [responders, setResponders] = useState<ResponderProfile[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [recommendations, setRecommendations] = useState<DispatchRecommendation[]>([]);
  const [selectedResponderId, setSelectedResponderId] = useState<string>("");
  const [modal, setModal] = useState<"dispatch" | "false" | null>(null);

  const { events } = useLiveEvents();
  const pushToast = useToast();
  const [audioAlertsEnabled, setAudioAlertsEnabled] = useState(true);
  const lastLiveEventIdRef = useRef<string | null>(null);

  const loadDashboard = useCallback(async () => {
    const [incList, respList, sum] = await Promise.all([
      mockApi.incidents(),
      mockApi.responders(),
      mockApi.analyticsSummary(),
    ]);
    setIncidents(incList);
    setResponders(respList);
    setSummary(sum);
    if (incList.length > 0) {
      setSelected((prev) => (prev && incList.some((i) => i.id === prev) ? prev : incList[0].id));
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    mockApi.getSettings().then((s) => {
      if (s) setAudioAlertsEnabled(s.audioAlertsEnabled);
    });
  }, [loadDashboard]);

  const open = incidents.filter((i) => !["resolved", "closed", "cancelled"].includes(i.status));
  const incident = incidents.find((i) => i.id === selected) ?? open[0] ?? incidents[0];

  const loadSelectedIncidentData = useCallback(async (incidentId: string) => {
    const [incDetail, recs] = await Promise.all([
      mockApi.incidentDetail(incidentId),
      mockApi.recommendations(incidentId),
    ]);
    setDetail(incDetail);
    setRecommendations(recs);
    if (recs.length > 0) {
      setSelectedResponderId(recs[0].responderId);
    }
  }, []);

  useEffect(() => {
    if (!incident?.id) {
      setDetail(null);
      setRecommendations([]);
      return;
    }
    void loadSelectedIncidentData(incident.id);
  }, [incident?.id, loadSelectedIncidentData]);

  useEffect(() => {
    if (events.length === 0) return;
    const latest = events[0];
    if (latest.id === lastLiveEventIdRef.current) return;
    lastLiveEventIdRef.current = latest.id;

    if (
      latest.type === "report.received" ||
      latest.type === "incident.updated" ||
      latest.type === "ai.assessment.ready" ||
      latest.type === "assignment.offered" ||
      latest.type === "assignment.updated" ||
      latest.type === "assignment.failed"
    ) {
      void loadDashboard();
      if (incident?.id && (!latest.incidentId || latest.incidentId === incident.id)) {
        void loadSelectedIncidentData(incident.id);
      }

      if (latest.type === "report.received") {
        pushToast({
          title: "New emergency report received",
          description: "Queue updated with live telemetry.",
        });
        if (audioAlertsEnabled) playAlertChime("dispatch");
      } else if (latest.type === "ai.assessment.ready") {
        pushToast({
          title: "AI triage assessment ready",
          description: "Evidence & duplicate matching refreshed.",
        });
      } else if (latest.type === "assignment.failed") {
        pushToast({
          title: "Responder escalated mission failure",
          description: "Immediate re-dispatch review needed.",
        });
        if (audioAlertsEnabled) playAlertChime("offer");
      }
    }
  }, [events, incident?.id, loadDashboard, loadSelectedIncidentData, pushToast, audioAlertsEnabled]);

  const activeRespondersCount =
    summary?.activeRespondersCount ??
    responders.filter((r) => r.status !== "offline" && r.status !== "off_duty").length;
  const avgResponseLabel = summary
    ? `${summary.avgArrivalTimeMinutes.toFixed(1)}m`
    : "—";
  const falseAlarmLabel = summary
    ? `${summary.falseAlarmRate.toFixed(1)}%`
    : "0%";
  const openQueueCount = summary?.openReportsCount ?? open.length;

  const topRecommendation = recommendations[0];
  const fallbackResponder = responders.find((r) => r.status !== "offline") || responders[0];
  const dispatchTargetId = selectedResponderId || topRecommendation?.responderId || fallbackResponder?.id || "";

  return (
    <CommandShell mode="operator" title="Live Dashboard">
      <div className="mb-5 grid grid-cols-4 gap-3">
        <Kpi label="Average response time" value={avgResponseLabel} hint="Live network dispatch" />
        <Kpi label="False-alarm rate" value={falseAlarmLabel} hint="Verified human oversight" />
        <Kpi label="Active responders" value={String(activeRespondersCount)} hint="Live active roster" />
        <Kpi label="Open reports" value={String(openQueueCount)} hint="Active queue depth" />
      </div>
      <div className="grid grid-cols-12 gap-4">
        <section className="col-span-3 rounded-3xl bg-[#f7f8fb] p-4">
          <h2 className="mb-3 text-sm font-semibold">Active incidents</h2>
          {open.length > 0 ? (
            <LiveQueueTable incidents={open} selectedId={incident?.id} onSelect={setSelected} />
          ) : (
            <p className="text-xs text-ink-700/50">No active incidents in queue.</p>
          )}
        </section>
        <section className="col-span-5">
          <LiveResponderMap
            mode="control_room"
            height={480}
            responders={responders}
            incidents={incidents}
            selectedResponderId={selectedResponderId}
            onSelectResponder={(r) => setSelectedResponderId(r.id)}
            selectedIncidentId={incident?.id}
            onSelectIncident={(inc) => setSelected(inc.id)}
            onRespondersUpdated={setResponders}
          />
        </section>
        <section className="col-span-4 space-y-3 rounded-3xl bg-white p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Triage and AI support</h2>
            {incident ? (
              <Link
                to={routes.operator.incident(incident.id)}
                className="text-xs font-medium text-command-600 hover:underline"
              >
                Full workspace
              </Link>
            ) : null}
          </div>
          {incident ? (
            <>
              <FireSmokeEvidenceCard vision={detail?.evidence?.vision} />
              {detail?.evidence?.text ? (
                <div className="rounded-2xl bg-paper-100 p-3 text-xs">
                  <p className="font-semibold">
                    AI text triage: {detail.evidence.text.suggestedCategory.replaceAll("_", " ")} ·{" "}
                    {detail.evidence.text.suggestedUrgency.toUpperCase()}
                  </p>
                  <p className="mt-1 text-ink-700/70">{detail.evidence.text.explanation}</p>
                </div>
              ) : null}
              <p className="text-xs text-ink-700/45">
                Model score is not a “verified probability”. Human confirmation is required before dispatch.
              </p>
              <DuplicateResolutionPanel
                incidentId={incident.id}
                initialDuplicates={detail?.evidence?.duplicates}
              />
              {recommendations.length > 0 ? (
                <div className="space-y-1.5 rounded-2xl bg-paper-100 p-3 text-xs">
                  <p className="font-semibold text-ink-900">
                    Suggested resources (policy rank, not auto-assign)
                  </p>
                  <select
                    aria-label="Select responder unit for dispatch"
                    className="mt-1 w-full rounded-xl border border-black/10 bg-white px-2.5 py-1.5 text-xs"
                    value={dispatchTargetId}
                    onChange={(e) => setSelectedResponderId(e.target.value)}
                  >
                    {recommendations.map((rec) => (
                      <option key={rec.responderId} value={rec.responderId}>
                        {rec.displayName} ({rec.unitCode}) · {rec.etaMinutes} min · {rec.distanceKm} km
                      </option>
                    ))}
                  </select>
                  {topRecommendation ? (
                    <p className="text-ink-700/60">{topRecommendation.matchReason}</p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-2xl bg-paper-100 p-3 text-xs text-ink-700/60">
                  {fallbackResponder
                    ? `Available unit: ${fallbackResponder.displayName} (${fallbackResponder.unitCode})`
                    : "No on-duty responders available."}
                </div>
              )}
              <Button
                className="w-full"
                variant="duty"
                disabled={!dispatchTargetId}
                onClick={() => setModal("dispatch")}
              >
                Verify & dispatch
              </Button>
              <Button className="w-full" variant="outline" onClick={() => setModal("false")}>
                Open false-report review
              </Button>
              <OperatorOverrideControl
                incidentId={incident.id}
                currentCategory={incident.category}
                currentUrgency={incident.urgency}
                onOverridden={async () => {
                  await loadDashboard();
                  await loadSelectedIncidentData(incident.id);
                }}
              />
            </>
          ) : (
            <p className="text-sm text-ink-700/50">Select an incident to view triage assessment.</p>
          )}
        </section>
      </div>
      <HumanOversightReviewModal
        open={modal === "dispatch"}
        title="Confirm assignment offer"
        onOpenChange={() => setModal(null)}
        onConfirm={async (reason) => {
          if (incident && dispatchTargetId) {
            await mockApi.dispatchIncident(incident.id, dispatchTargetId, reason);
            await loadDashboard();
            await loadSelectedIncidentData(incident.id);
          }
          setModal(null);
        }}
      />
      <HumanOversightReviewModal
        open={modal === "false"}
        title="Documented false / malicious review"
        onOpenChange={() => setModal(null)}
        onConfirm={async (reason) => {
          if (incident) {
            await mockApi.updateIncidentState(incident.id, "cancelled", reason);
            await loadDashboard();
          }
          setModal(null);
        }}
      />
    </CommandShell>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-card">
      <p className="text-xs text-ink-700/50">{label}</p>
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="text-[11px] text-ink-700/40">{hint}</p>
    </div>
  );
}
