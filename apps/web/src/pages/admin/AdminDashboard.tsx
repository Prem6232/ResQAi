import { CommandShell } from "@/components/common/CommandShell";
import { DemoDrillModeToggle } from "@/features/admin/components/DemoDrillModeToggle";

export function AdminDashboard() {
  return (
    <CommandShell mode="admin" title="Administrator">
      <div className="max-w-xl space-y-4">
        <DemoDrillModeToggle />
        <div className="rounded-3xl bg-white p-5 shadow-card text-sm text-ink-700/70">
          Approve responders, configure operating areas, inspect audit logs, and keep demo/drill data labelled.
        </div>
      </div>
    </CommandShell>
  );
}
