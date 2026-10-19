import type { Incident } from "@/types/incident";

export function ActiveTaskCard({ incident }: { incident: Incident }) {
  return (
    <div className="rounded-3xl bg-ink-900 p-4 text-white">
      <p className="text-xs uppercase tracking-wide text-white/60">En route to {incident.locationLabel}</p>
      <p className="mt-2 font-display text-2xl font-bold">Turn left in 200 m</p>
      <p className="mt-2 text-xs text-white/50">Baseline route · not live traffic · not guaranteed safe</p>
    </div>
  );
}
