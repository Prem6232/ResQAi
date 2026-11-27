import { Switch } from "@/components/ui/switch";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function DemoDrillModeToggle({ onChanged }: { onChanged?: (enabled: boolean) => void }) {
  const [on, setOn] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    api.analyticsSummary().then((sum) => {
      if (sum) setOn(sum.syntheticDrillMode);
    });
  }, []);

  const handleToggle = async (val: boolean) => {
    const prev = on;
    setOn(val);
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await api.toggleDrillMode(val);
      setOn(res.drillMode);
      onChanged?.(res.drillMode);
      setStatusMsg({
        tone: "ok",
        text: res.drillMode
          ? "Drill mode enabled and logged to audit trail."
          : "Live production mode active and logged to audit trail.",
      });
    } catch {
      setOn(prev);
      setStatusMsg({
        tone: "err",
        text: "Failed to persist drill mode state. Please retry.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
      <label className="flex items-center justify-between gap-4 cursor-pointer">
        <span>
          <span className="block text-sm font-bold text-slate-900">Synthetic demo / drill mode</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Labels drill alerts in analytics and persists state across Redis and PostgreSQL audit logs.
          </span>
        </span>
        <Switch checked={on} disabled={saving} onCheckedChange={(val) => void handleToggle(val)} />
      </label>
      {statusMsg ? (
        <p
          className={`mt-2.5 text-xs font-medium ${
            statusMsg.tone === "ok" ? "text-emerald-700" : "text-rose-600"
          }`}
        >
          {statusMsg.text}
        </p>
      ) : null}
    </div>
  );
}
