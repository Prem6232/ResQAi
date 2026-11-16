import { CommandShell } from "@/components/common/CommandShell";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { mockApi } from "@/lib/mock-api";

export function OperatorSettingsPage() {
  const [human, setHuman] = useState(true);
  const [audioAlerts, setAudioAlerts] = useState(true);
  const [clusterRadius, setClusterRadius] = useState("150");
  const [threshold, setThreshold] = useState("0.80");
  const [triageWindow, setTriageWindow] = useState("30");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    mockApi.getSettings().then((s) => {
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
    setSavedMsg(null);
    try {
      await mockApi.updateSettings({
        autoDispatchEnabled: !nextHuman,
        audioAlertsEnabled: nextAudio,
        clusterRadiusMeters: Math.max(25, Number(clusterRadius) || 150),
        highUrgencyThreshold: Math.min(1, Math.max(0.1, Number(threshold) || 0.8)),
        triageWindowMinutes: Math.max(5, Number(triageWindow) || 30),
      });
      setSavedMsg("Settings saved to backend.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <CommandShell mode="operator" title="System Settings">
      <div className="grid grid-cols-2 gap-4">
        <section className="rounded-3xl bg-white p-5 shadow-card space-y-4">
          <h2 className="font-semibold">Severity and AI thresholds</h2>
          <div>
            <label className="block text-xs text-ink-700/60">
              High-urgency review threshold (0.1 – 1.0)
              <Input
                className="mt-1"
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
            <label className="block text-xs text-ink-700/60">
              Duplicate match / spatial cluster radius (meters)
              <Input
                className="mt-1"
                type="number"
                min="25"
                value={clusterRadius}
                onChange={(e) => setClusterRadius(e.target.value)}
              />
            </label>
          </div>
          <div>
            <label className="block text-xs text-ink-700/60">
              Clustering triage window (minutes)
              <Input
                className="mt-1"
                type="number"
                min="5"
                value={triageWindow}
                onChange={(e) => setTriageWindow(e.target.value)}
              />
            </label>
          </div>
          <label className="flex items-center justify-between text-sm">
            Audio dispatch alerts
            <Switch
              checked={audioAlerts}
              onCheckedChange={(val) => {
                setAudioAlerts(val);
                void persistSettings(human, val);
              }}
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            Require human confirmation
            <Switch
              checked={human}
              onCheckedChange={(val) => {
                setHuman(val);
                void persistSettings(val, audioAlerts);
              }}
            />
          </label>
          <Button variant="command" disabled={saving} onClick={() => persistSettings()}>
            {saving ? "Saving…" : "Save thresholds"}
          </Button>
          {savedMsg ? <p className="text-xs text-duty-600">{savedMsg}</p> : null}
          <p className="text-xs text-ink-700/45">
            Scores are classifier outputs, not verification percentages. Human confirmation stays on for MVP.
          </p>
        </section>
        <section className="rounded-3xl bg-white p-5 shadow-card">
          <h2 className="font-semibold">Notifications and privacy</h2>
          <Field label="Escalate unanswered offers after" value="90 sec" />
          <Field label="Keep media for" value="90 days (policy)" />
          <p className="mt-4 text-xs text-ink-700/45">
            Deployment still requires institutional legal review. These controls do not equal compliance.
          </p>
        </section>
      </div>
    </CommandShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-4">
      <p className="text-xs text-ink-700/50">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
