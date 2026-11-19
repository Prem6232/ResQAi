import { CommandShell } from "@/components/common/CommandShell";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { Sliders, Shield, Bell, CheckCircle2, Save } from "lucide-react";

export function OperatorSettingsPage() {
  const [human, setHuman] = useState(true);
  const [audioAlerts, setAudioAlerts] = useState(true);
  const [clusterRadius, setClusterRadius] = useState("150");
  const [threshold, setThreshold] = useState("0.80");
  const [triageWindow, setTriageWindow] = useState("30");
  const [saving, setSaving] = useState(false);
  const pushToast = useToast();

  useEffect(() => {
    api.getSettings().then((s) => {
      if (s) {
        setHuman(!s.autoDispatchEnabled);
        setAudioAlerts(s.audioAlertsEnabled);
        setClusterRadius(String(s.clusterRadiusMeters));
        setThreshold(String(s.highUrgencyThreshold));
        setTriageWindow(String(s.triageWindowMinutes));
      }
    });
  }, []);

  const persistSettings = async (nextHuman = human, nextAudio = audioAlerts) => {
    setSaving(true);
    try {
      await api.updateSettings({
        autoDispatchEnabled: !nextHuman,
        audioAlertsEnabled: nextAudio,
        clusterRadiusMeters: Math.max(25, Number(clusterRadius) || 150),
        highUrgencyThreshold: Math.min(1, Math.max(0.1, Number(threshold) || 0.8)),
        triageWindowMinutes: Math.max(5, Number(triageWindow) || 30),
      });
      pushToast({
        title: "Settings Saved",
        description: "Bhopal grid dispatch parameters updated successfully.",
      });
    } catch {
      pushToast({
        title: "Update Failed",
        description: "Could not save settings to backend.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <CommandShell
      mode="operator"
      title="System Settings"
      subtitle="Configure dispatch algorithms, PostGIS clustering radius, and HITL safety constraints"
    >
      <div className="grid grid-cols-12 gap-5">
        {/* Left Section: Thresholds & Safety */}
        <section className="col-span-12 lg:col-span-7 space-y-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Sliders className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Severity, GIS Clustering & AI Thresholds
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                High-Urgency Review Threshold (0.1 – 1.0)
                <span className="block mt-0.5 font-normal text-[11px] text-slate-500">
                  Incidents with model score above this require immediate high-priority triage
                </span>
                <Input
                  className="mt-1.5 h-9 rounded-xl text-xs font-mono"
                  type="number"
                  step="0.05"
                  min="0.1"
                  max="1"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                />
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Duplicate Match / Spatial Cluster Radius (meters)
                <span className="block mt-0.5 font-normal text-[11px] text-slate-500">
                  Radius within Bhopal where concurrent reports are auto-grouped as duplicates
                </span>
                <Input
                  className="mt-1.5 h-9 rounded-xl text-xs font-mono"
                  type="number"
                  min="25"
                  value={clusterRadius}
                  onChange={(e) => setClusterRadius(e.target.value)}
                />
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Clustering Triage Window (minutes)
                <span className="block mt-0.5 font-normal text-[11px] text-slate-500">
                  Time threshold for aggregating related incoming citizen alerts
                </span>
                <Input
                  className="mt-1.5 h-9 rounded-xl text-xs font-mono"
                  type="number"
                  min="5"
                  value={triageWindow}
                  onChange={(e) => setTriageWindow(e.target.value)}
                />
              </label>
            </div>

            <div className="pt-2 space-y-3">
              <label className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50 p-3 text-xs font-medium text-slate-800">
                <div>
                  <span className="font-bold">Audio Dispatch Alerts</span>
                  <p className="text-[11px] text-slate-500">Play chime when high-urgency SOS arrives</p>
                </div>
                <Switch
                  checked={audioAlerts}
                  onCheckedChange={(val) => {
                    setAudioAlerts(val);
                    void persistSettings(human, val);
                  }}
                />
              </label>

              <label className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50 p-3 text-xs font-medium text-slate-800">
                <div>
                  <span className="font-bold flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-blue-600" />
                    Require Human Confirmation (HITL)
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Mandatory operator sign-off before dispatch offers are broadcast
                  </p>
                </div>
                <Switch
                  checked={human}
                  onCheckedChange={(val) => {
                    setHuman(val);
                    void persistSettings(val, audioAlerts);
                  }}
                />
              </label>
            </div>

            <div className="pt-2">
              <Button
                className="gap-2 rounded-xl bg-slate-900 text-white text-xs font-bold px-4 py-2 hover:bg-slate-800"
                disabled={saving}
                onClick={() => void persistSettings(human, audioAlerts)}
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? "Saving…" : "Save Thresholds"}
              </Button>
            </div>
          </div>
        </section>

        {/* Right Section: Notification & Data Policy */}
        <section className="col-span-12 lg:col-span-5 space-y-5 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Bell className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Escalation & Bhopal Policy
            </h2>
          </div>

          <div className="space-y-4 text-xs">
            <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200/60">
              <span className="font-bold text-slate-800">Responder Escalation Timer</span>
              <p className="mt-1 font-mono text-base font-bold text-emerald-700">90 seconds</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                If dispatched unit does not accept assignment within 90s, the offer automatically cascades to the next nearest unit in Bhopal.
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200/60">
              <span className="font-bold text-slate-800">Telemetry & Evidence Retention</span>
              <p className="mt-1 font-mono text-base font-bold text-blue-700">90 days</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Audio voice clips, triage images, and GPS tracks are preserved for operational audit in accordance with city guidelines.
              </p>
            </div>

            <div className="rounded-xl bg-emerald-50/70 p-3.5 ring-1 ring-inset ring-emerald-600/20">
              <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Spatial Bounds: Bhopal Metro
              </div>
              <p className="mt-1 text-[11px] text-emerald-800/80">
                All coordinates are bounded to latitude 23.1600 – 23.3500 and longitude 77.3000 – 77.5300.
              </p>
            </div>
          </div>
        </section>
      </div>
    </CommandShell>
  );
}
