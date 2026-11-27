import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AssignmentStatus } from "@/types/assignment";

export function StatusTransitionControls({
  status,
  busy,
  onTransition,
}: {
  status: AssignmentStatus;
  busy?: boolean;
  onTransition: (next: "en_route" | "arrived" | "completed" | "failed", reason?: string) => void;
}) {
  const [failing, setFailing] = useState(false);
  const [failReason, setFailReason] = useState("");

  if (!["accepted", "en_route", "arrived"].includes(status)) {
    return null;
  }

  return (
    <div className="space-y-2.5">
      {status === "accepted" ? (
        <Button className="w-full" variant="dark" disabled={busy} onClick={() => onTransition("en_route")}>
          {busy ? "Updating…" : "Start En Route"}
        </Button>
      ) : null}
      {status === "en_route" ? (
        <Button className="w-full" variant="dark" disabled={busy} onClick={() => onTransition("arrived")}>
          {busy ? "Updating…" : "Arrived at scene"}
        </Button>
      ) : null}
      {status === "arrived" ? (
        <Button className="w-full" variant="duty" disabled={busy} onClick={() => onTransition("completed")}>
          {busy ? "Updating…" : "Mark mission completed"}
        </Button>
      ) : null}

      {!failing ? (
        <Button
          type="button"
          className="w-full"
          variant="outline"
          disabled={busy}
          onClick={() => setFailing(true)}
        >
          Escalate / Report mission issue
        </Button>
      ) : (
        <div className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50/50 p-3">
          <Textarea
            value={failReason}
            onChange={(e) => setFailReason(e.target.value)}
            placeholder="Mandatory reason for mission failure or re-dispatch"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="default"
              className="flex-1 bg-rose-600 text-white hover:bg-rose-700"
              disabled={busy || !failReason.trim()}
              onClick={() => {
                onTransition("failed", failReason.trim());
                setFailReason("");
                setFailing(false);
              }}
            >
              Confirm failure
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setFailing(false);
                setFailReason("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
