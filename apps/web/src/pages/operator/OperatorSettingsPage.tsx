import { CommandShell } from "@/components/common/CommandShell";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";

export function OperatorSettingsPage() {
  const [human, setHuman] = useState(true);
  const [keepOriginal, setKeepOriginal] = useState(true);
  return (
    <CommandShell mode="operator" title="System Settings">
      <div className="grid grid-cols-2 gap-4">
        <section className="rounded-3xl bg-white p-5 shadow-card">
          <h2 className="font-semibold">Severity and AI thresholds</h2>
          <Field label="Send to manual review below score" value="0.60" />
          <Field label="Duplicate match distance" value="150 m" />
          <label className="mt-4 flex items-center justify-between text-sm">
            Keep every original report
            <Switch checked={keepOriginal} onCheckedChange={setKeepOriginal} />
          </label>
          <label className="mt-3 flex items-center justify-between text-sm">
            Require human confirmation
            <Switch checked={human} onCheckedChange={setHuman} />
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
