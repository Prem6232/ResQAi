import { CommandShell } from "@/components/common/CommandShell";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { mockApi } from "@/lib/mock-api";

export function OperatorSettingsPage() {
  const [human, setHuman] = useState(true);
  const [keepOriginal, setKeepOriginal] = useState(true);
  const [clusterRadius, setClusterRadius] = useState("150 m");
  const [threshold, setThreshold] = useState("0.60");

  useEffect(() => {
    mockApi.getSettings().then((s) => {
      if (s) {
        if (s.clusterRadiusMeters || s.cluster_radius_meters) {
          setClusterRadius(`${s.clusterRadiusMeters || s.cluster_radius_meters} m`);
        }
        if (s.highUrgencyThreshold || s.high_urgency_threshold) {
          setThreshold(String(s.highUrgencyThreshold || s.high_urgency_threshold));
        }
      }
    });
  }, []);

  const handleToggleHuman = async (val: boolean) => {
    setHuman(val);
    await mockApi.updateSettings({ autoDispatchEnabled: !val, auto_dispatch_enabled: !val });
  };

  return (
    <CommandShell mode="operator" title="System Settings">
      <div className="grid grid-cols-2 gap-4">
        <section className="rounded-3xl bg-white p-5 shadow-card">
          <h2 className="font-semibold">Severity and AI thresholds</h2>
          <Field label="Send to manual review below score" value={threshold} />
          <Field label="Duplicate match distance" value={clusterRadius} />
          <label className="mt-4 flex items-center justify-between text-sm">
            Keep every original report
            <Switch checked={keepOriginal} onCheckedChange={setKeepOriginal} />
          </label>
          <label className="mt-3 flex items-center justify-between text-sm">
            Require human confirmation
            <Switch checked={human} onCheckedChange={handleToggleHuman} />
          </label>
          <p className="mt-3 text-xs text-ink-700/45">
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
