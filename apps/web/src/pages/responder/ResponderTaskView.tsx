import { ActiveTaskCard } from "@/features/responder/components/ActiveTaskCard";
import { RouteGuidanceSheet } from "@/features/responder/components/RouteGuidanceSheet";
import { StatusTransitionControls } from "@/features/responder/components/StatusTransitionControls";
import { OperationalNotesForm } from "@/features/responder/components/OperationalNotesForm";
import { mockApi } from "@/lib/mock-api";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { routes } from "@/config/routes.config";
import { useState, useEffect, useCallback } from "react";
import type { Assignment } from "@/types/assignment";
import { StatusIndicator } from "@/components/common/StatusIndicator";
import { useGeolocation } from "@/hooks/useGeolocation";

export function ResponderTaskView() {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const geo = useGeolocation();

  const loadAssignments = useCallback(async () => {
    const asgs = await mockApi.assignments();
    const active =
      asgs.find((a) => a.status === "accepted" || a.status === "en_route" || a.status === "arrived") ||
      asgs.find((a) => a.status === "offered") ||
      null;
    setAssignment(active);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAssignments();
    geo.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAssignments]);

  const handleTransition = async (next: "en_route" | "arrived" | "completed") => {
    if (!assignment) return;
    setUpdating(true);
    setError(null);
    try {
      await mockApi.updateAssignmentStatus(assignment.id, next);
      await loadAssignments();
    } catch {
      setError("Could not update assignment status.");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-card text-center">
        <p className="text-sm text-ink-700/50">Loading active mission…</p>
      </div>
    );
  }

  if (!assignment || !assignment.incident) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-card text-center">
        <p className="text-sm text-ink-700/50">No active assigned mission currently.</p>
        <Button asChild className="mt-4" variant="outline">
          <Link to={routes.responder.feed}>Back to Duty Feed</Link>
        </Button>
      </div>
    );
  }

  const incident = assignment.incident;
  const statusTone = assignment.status === "arrived" ? "ok" : "info";
  const statusLabel =
    assignment.status === "arrived"
      ? "On scene"
      : typeof assignment.etaMinutes === "number"
        ? `${assignment.etaMinutes} min`
        : assignment.status.replaceAll("_", " ");

  return (
    <div className="space-y-4">
      <ActiveTaskCard
        incident={incident}
        etaMinutes={assignment.etaMinutes}
        distanceKm={assignment.distanceKm}
        routeNote={assignment.routeNote}
        status={assignment.status}
      />
      <RouteGuidanceSheet
        fromPoint={geo.point}
        toPoint={incident.location}
        targetIncident={incident}
        durationMinutes={assignment.etaMinutes}
        distanceKm={assignment.distanceKm}
        enableAutoPing={assignment.status === "en_route"}
        onLocationSynced={loadAssignments}
      />
      <div className="rounded-3xl bg-white p-4 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">{incident.title}</p>
            <p className="text-xs text-ink-700/50">{incident.locationLabel}</p>
          </div>
          <StatusIndicator label={statusLabel} tone={statusTone} />
        </div>
        {error ? <p className="mt-2 text-xs text-sos-600">{error}</p> : null}
        <div className="mt-4">
          <StatusTransitionControls
            status={assignment.status}
            busy={updating}
            onTransition={handleTransition}
          />
        </div>
        <Button asChild className="mt-3 w-full" variant="outline">
          <Link to={routes.responder.feed}>Back to Duty Feed</Link>
        </Button>
      </div>
      <div className="rounded-3xl bg-white p-4 shadow-card">
        <p className="mb-2 text-sm font-semibold">Field operational notes</p>
        <OperationalNotesForm assignmentId={assignment.id} onSaved={loadAssignments} />
      </div>
    </div>
  );
}
