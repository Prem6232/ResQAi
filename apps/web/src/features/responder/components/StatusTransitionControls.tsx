import { Button } from "@/components/ui/button";
import type { AssignmentStatus } from "@/types/assignment";

export function StatusTransitionControls({
  status,
  busy,
  onTransition,
}: {
  status: AssignmentStatus;
  busy?: boolean;
  onTransition: (next: "en_route" | "arrived" | "completed") => void;
}) {
  if (status === "accepted") {
    return (
      <Button className="w-full" variant="dark" disabled={busy} onClick={() => onTransition("en_route")}>
        {busy ? "Updating…" : "Start En Route"}
      </Button>
    );
  }
  if (status === "en_route") {
    return (
      <Button className="w-full" variant="dark" disabled={busy} onClick={() => onTransition("arrived")}>
        {busy ? "Updating…" : "Arrived at scene"}
      </Button>
    );
  }
  if (status === "arrived") {
    return (
      <Button className="w-full" variant="duty" disabled={busy} onClick={() => onTransition("completed")}>
        {busy ? "Updating…" : "Mark mission completed"}
      </Button>
    );
  }
  return null;
}
