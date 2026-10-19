import { ActiveTaskCard } from "@/features/responder/components/ActiveTaskCard";
import { RouteGuidanceSheet } from "@/features/responder/components/RouteGuidanceSheet";
import { StatusTransitionControls } from "@/features/responder/components/StatusTransitionControls";
import { mockIncidents } from "@/lib/mock-store";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { routes } from "@/config/routes.config";
import { useState } from "react";
import { StatusIndicator } from "@/components/common/StatusIndicator";

export function ResponderTaskView() {
  const incident = mockIncidents[0];
  const [arrived, setArrived] = useState(false);
  return (
    <div className="space-y-4">
      <ActiveTaskCard incident={incident} />
      <RouteGuidanceSheet />
      <div className="rounded-3xl bg-white p-4 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">{incident.title}</p>
            <p className="text-xs text-ink-700/50">{incident.locationLabel}</p>
          </div>
          <StatusIndicator label={arrived ? "On scene" : "4 min"} tone={arrived ? "ok" : "info"} />
        </div>
        <div className="mt-4">
          <StatusTransitionControls onArrived={() => setArrived(true)} />
        </div>
        <Button asChild className="mt-3 w-full" variant="outline">
          <Link to={routes.responder.feed}>View incident details</Link>
        </Button>
      </div>
    </div>
  );
}
