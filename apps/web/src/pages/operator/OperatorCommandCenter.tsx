import { CommandShell } from "@/components/common/CommandShell";
import { LiveQueueTable } from "@/features/operator/components/LiveQueueTable";
import { LiveResponderMap } from "@/components/maps/LiveResponderMap";
import {
  api,
  type AnalyticsSummary,
  type DispatchRecommendation,
  type IncidentDetail,
} from "@/lib/api";
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
import {
  Timer,
  ShieldCheck,
  Truck,
  AlertTriangle,
  Send,
  ExternalLink,
  Info,
  Radio,
} from "lucide-react";

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
      api.incidents(),
      api.responders(),
      api.analyticsSummary(),
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
    api.getSettings().then((s) => {
      if (s) setAudioAlertsEnabled(s.audioAlertsEnabled);
    });
  }, [loadDashboard]);

  const open = incidents.filter((i) => !["resolved", "closed", "cancelled"].includes(i.status));
  const incident = incidents.find((i) => i.id === selected) ?? open[0] ?? incidents[0];

  const loadSelectedIncidentData = useCallback(async (incidentId: string) => {
    const [incDetail, recs] = await Promise.all([
      api.incidentDetail(incidentId),
      api.recommendations(incidentId),
    ]);
    setDetail(incDetail);
    setRecommendations(recs);
    setSelectedResponderId((prev) =>
      prev && recs.some((r) => r.responderId === prev) ? prev : recs[0]?.responderId ?? ""
    );
  }, []);

  useEffect(() => {
    if (!incident?.id) {
      setDetail(null);
      setRecommendations([]);
      setSelectedResponderId("");
      return;
    }
    setSelectedResponderId("");
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
          description: "Queue updated with live telemetry in Bhopal.",
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
    : "3.2m";
  const falseAlarmLabel = summary
    ? `${summary.falseAlarmRate.toFixed(1)}%`
    : "0.0%";
  const openQueueCount = summary?.openReportsCount ?? open.length;

  const topRecommendation = recommendations[0];
  const selectedRecommendation =
    recommendations.find((r) => r.responderId === selectedResponderId) ?? topRecommendation;
  const fallbackResponder = responders.find((r) => r.status !== "offline") || responders[0];
  const dispatchTargetId = selectedResponderId || topRecommendation?.responderId || fallbackResponder?.id || "";

  return (
    <CommandShell
      mode="operator"
      title="Bhopal Command Center"
      subtitle="Real-time emergency dispatch queue, automated AI triage, and live fleet monitoring"
    >
      {/* High-Impact Tactical KPI Grid */}
      <div className="mb-6 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <Kpi
          label="Average Response Time"
          value={avgResponseLabel}
          hint="Bhopal Metro Dispatch"
          icon={Timer}
          color="emerald"
          trend="Real-time"
        />
        <Kpi
          label="Human Verification"
          value={falseAlarmLabel}
          hint="False-Alarm Ratio"
          icon={ShieldCheck}
          color="blue"
          trend="HITL Active"
        />
        <Kpi
          label="Active Field Units"
          value={String(activeRespondersCount)}
          hint="Responders On-Duty"
          icon={Truck}
          color="emerald"
          trend={`${responders.length} Registered`}
        />
        <Kpi
          label="Open Queue Depth"
          value={String(openQueueCount)}
          hint="Pending Dispatches"
          icon={AlertTriangle}
          color={openQueueCount > 0 ? "rose" : "emerald"}
          trend="Live Queue"
        />
      </div>

      {/* Main 3-Column Operational Layout */}
      <div className="grid grid-cols-12 gap-5">
        {/* Left Column: Active Incidents Queue */}
        <section className="col-span-12 flex flex-col rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 shadow-xs lg:col-span-3">
          <div className="mb-3.5 flex items-center justify-between gap-2">
            <h2 className="flex min-w-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
              <span className="truncate">Incident Queue</span>
            </h2>
            <span className="shrink-0 whitespace-nowrap rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
              {open.length} Active
            </span>
          </div>

          <div className="flex-1 overflow-y-auto pr-1">
            {open.length > 0 ? (
              <LiveQueueTable incidents={open} selectedId={incident?.id} onSelect={setSelected} />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
                <ShieldCheck className="mx-auto h-8 w-8 text-emerald-500" />
                <p className="mt-2 text-xs font-semibold text-slate-700">All clear in Bhopal Grid</p>
                <p className="mt-0.5 text-[11px] text-slate-400">No pending emergency alerts</p>
              </div>
            )}
          </div>
        </section>

        {/* Center Column: Live GIS Map */}
        <section className="col-span-12 lg:col-span-5">
          <LiveResponderMap
            mode="control_room"
            height={520}
            responders={responders}
            incidents={incidents}
            selectedResponderId={selectedResponderId}
            onSelectResponder={(r) => setSelectedResponderId(r.id)}
            selectedIncidentId={incident?.id}
            onSelectIncident={(inc) => setSelected(inc.id)}
            onRespondersUpdated={setResponders}
          />
        </section>

        {/* Right Column: AI Triage & Dispatch Action Panel */}
        <section className="col-span-12 space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs lg:col-span-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                AI Triage & Decision Support
              </h2>
              <p className="text-[11px] text-slate-400">Human-In-The-Loop dispatch authority</p>
            </div>
            {incident ? (
              <Link
                to={routes.operator.incident(incident.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <span>Workspace</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            ) : null}
          </div>

          {incident ? (
            <div className="space-y-4">
              {/* Vision Assessment */}
              <FireSmokeEvidenceCard vision={detail?.evidence?.vision} />

              {/* Text Assessment */}
              {detail?.evidence?.text ? (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">
                      AI Suggested: {detail.evidence.text.suggestedCategory.replaceAll("_", " ").toUpperCase()}
                    </span>
                    <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                      {detail.evidence.text.suggestedUrgency.toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-1.5 text-slate-600 leading-relaxed">
                    {detail.evidence.text.explanation}
                  </p>
                </div>
              ) : null}

              {/* HITL Rule notice */}
              <div className="flex items-start gap-2 rounded-xl bg-amber-50/70 p-2.5 text-[11px] text-amber-900 ring-1 ring-inset ring-amber-600/20">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                <span>
                  Operator authorization required. AI scores inform priority but never bypass human confirmation.
                </span>
              </div>

              {/* Duplicate Detection */}
              <DuplicateResolutionPanel
                incidentId={incident.id}
                initialDuplicates={detail?.evidence?.duplicates}
              />

              {/* Resource Recommendation & Selector */}
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  Select Unit for Dispatch
                </label>
                {recommendations.length > 0 ? (
                  <>
                    <select
                      aria-label="Select responder unit for dispatch"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 shadow-xs focus:border-emerald-500 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                      value={dispatchTargetId}
                      onChange={(e) => setSelectedResponderId(e.target.value)}
                    >
                      {recommendations.map((rec) => (
                        <option key={rec.responderId} value={rec.responderId}>
                          {rec.displayName} ({rec.unitCode}) · ETA: {rec.etaMinutes} min · {rec.distanceKm} km
                        </option>
                      ))}
                    </select>
                    {selectedRecommendation ? (
                      <p className="text-[11px] font-medium text-slate-500">
                        ⚡ {selectedRecommendation.matchReason}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-600">
                    {fallbackResponder
                      ? `Target Unit: ${fallbackResponder.displayName} (${fallbackResponder.unitCode}) · ${fallbackResponder.status}`
                      : "No on-duty responders available. Check Responders roster."}
                  </div>
                )}
              </div>

              {/* Primary Action Buttons */}
              <div className="space-y-2">
                <Button
                  className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 shadow-sm transition"
                  disabled={!dispatchTargetId}
                  onClick={() => setModal("dispatch")}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Verify & Dispatch Field Unit
                </Button>

                <Button
                  className="w-full rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 text-xs py-2"
                  variant="outline"
                  onClick={() => setModal("false")}
                >
                  Document False / Cancelled Report
                </Button>
              </div>

              {/* Incident Override Control */}
              <OperatorOverrideControl
                incidentId={incident.id}
                currentCategory={incident.category}
                currentUrgency={incident.urgency}
                onOverridden={async () => {
                  await loadDashboard();
                  await loadSelectedIncidentData(incident.id);
                }}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
              <Radio className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-xs font-semibold text-slate-600">No incident selected</p>
              <p className="mt-0.5 text-[11px] text-slate-400">Select an item from the queue to review</p>
            </div>
          )}
        </section>
      </div>

      {/* Oversight Modals */}
      <HumanOversightReviewModal
        open={modal === "dispatch"}
        title="Confirm Field Assignment Offer"
        onOpenChange={() => setModal(null)}
        onConfirm={async (reason) => {
          if (incident && dispatchTargetId) {
            await api.dispatchIncident(incident.id, dispatchTargetId, reason);
            await loadDashboard();
            await loadSelectedIncidentData(incident.id);
            pushToast({
              title: "Dispatch offer sent",
              description: `Unit dispatched to incident ${incident.publicCode} in Bhopal.`,
            });
          }
          setModal(null);
        }}
      />
      <HumanOversightReviewModal
        open={modal === "false"}
        title="Documented False / Malicious Report Review"
        onOpenChange={() => setModal(null)}
        onConfirm={async (reason) => {
          if (incident) {
            await api.updateIncidentState(incident.id, "cancelled", reason);
            await loadDashboard();
            pushToast({
              title: "Incident Cancelled",
              description: `Incident marked as false/cancelled with audit justification.`,
            });
          }
          setModal(null);
        }}
      />
    </CommandShell>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  color = "emerald",
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ElementType;
  trend?: string;
  color?: "emerald" | "amber" | "rose" | "blue";
}) {
  const colorStyles = {
    emerald: "from-emerald-500/10 to-teal-500/5 text-emerald-700 border-emerald-200/60",
    amber: "from-amber-500/10 to-orange-500/5 text-amber-700 border-amber-200/60",
    rose: "from-rose-500/10 to-red-500/5 text-rose-700 border-rose-200/60",
    blue: "from-blue-500/10 to-indigo-500/5 text-blue-700 border-blue-200/60",
  }[color];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition hover:shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <div className={`rounded-xl border bg-gradient-to-br p-2 ${colorStyles}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 font-display text-2xl font-black tracking-tight text-slate-900">{value}</p>
      <div className="mt-1 flex items-center justify-between text-[11px]">
        <span className="font-medium text-slate-400">{hint}</span>
        {trend ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">
            {trend}
          </span>
        ) : null}
      </div>
    </div>
  );
}
