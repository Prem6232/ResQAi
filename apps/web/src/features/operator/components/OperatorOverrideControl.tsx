import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const CATEGORY_OPTIONS = [
  { value: "fire_smoke", label: "Fire & Smoke" },
  { value: "road_accident", label: "Road Accident" },
  { value: "medical", label: "Medical" },
  { value: "personal_safety", label: "Personal Safety" },
  { value: "water_flood", label: "Water & Flood" },
  { value: "hazard", label: "Hazard" },
  { value: "other", label: "Other" },
] as const;

const URGENCY_OPTIONS = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

export function OperatorOverrideControl({
  incidentId,
  currentCategory,
  currentUrgency,
  onOverridden,
}: {
  incidentId?: string;
  currentCategory?: string;
  currentUrgency?: string;
  onOverridden?: () => void;
}) {
  const [category, setCategory] = useState(currentCategory || "hazard");
  const [urgency, setUrgency] = useState(currentUrgency || "high");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCategory(currentCategory || "hazard");
    setUrgency(currentUrgency || "high");
    setReason("");
    setError(null);
  }, [incidentId, currentCategory, currentUrgency]);

  const handleSave = async () => {
    if (!incidentId || !reason.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.overrideIncident(incidentId, category, urgency, reason.trim());
      setReason("");
      onOverridden?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save override.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Override AI suggestion</p>
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label="Override category"
          className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Override urgency"
          className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
          value={urgency}
          onChange={(e) => setUrgency(e.target.value)}
        >
          {URGENCY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required reason" />
      {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
      <Button variant="outline" disabled={!reason.trim() || saving} onClick={handleSave}>
        {saving ? "Saving..." : "Save override"}
      </Button>
    </div>
  );
}
