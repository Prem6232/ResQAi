import type { AssignmentIncidentSummary } from "@/types/assignment";

export function ActiveTaskCard({
  incident,
  etaMinutes,
  distanceKm,
  routeNote,
  status,
}: {
  incident: AssignmentIncidentSummary;
  etaMinutes?: number;
  distanceKm?: number;
  routeNote?: string;
  status?: string;
}) {
  return (
    <div className="rounded-3xl bg-ink-900 p-4 text-white">
      <p className="text-xs uppercase tracking-wide text-white/60">
        {status ? status.replaceAll("_", " ") : "Active"} · {incident.locationLabel}
      </p>
      <p className="mt-2 font-display text-2xl font-bold">
        {typeof distanceKm === "number" ? `${distanceKm} km away` : incident.title}
        {typeof etaMinutes === "number" ? ` · ${etaMinutes} min ETA` : ""}
      </p>
      <p className="mt-2 text-xs text-white/50">
        {routeNote || "Geodesic route estimate · not live traffic · not guaranteed safe"}
      </p>
    </div>
  );
}
