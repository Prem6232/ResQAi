import { CommandShell } from "@/components/common/CommandShell";

export function OperationalAnalyticsPage() {
  return (
    <CommandShell mode="admin" title="Operational analytics">
      <p className="text-sm text-ink-700/70">
        Drill metrics only. Real operational measurements require a later lawful collection period.
        Use the operator geospatial analytics view for the density map.
      </p>
    </CommandShell>
  );
}
