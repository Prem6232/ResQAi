import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { mockApi } from "@/lib/mock-api";

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
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!incidentId || !reason.trim()) return;
    setSaving(true);
    try {
      await mockApi.overrideIncident(
        incidentId,
        currentCategory || "hazard",
        currentUrgency || "high",
        reason
      );
      setReason("");
      onOverridden?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Override AI suggestion</p>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required reason" />
      <Button variant="outline" disabled={!reason.trim() || saving} onClick={handleSave}>
        {saving ? "Saving..." : "Save override"}
      </Button>
    </div>
  );
}
