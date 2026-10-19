import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function OperatorOverrideControl() {
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Override AI suggestion</p>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required reason" />
      <Button variant="outline" disabled={!reason.trim()}>
        Save override
      </Button>
    </div>
  );
}
