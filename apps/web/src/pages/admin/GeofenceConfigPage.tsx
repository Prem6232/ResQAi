import { CommandShell } from "@/components/common/CommandShell";
import { CampusBoundaryEditor } from "@/features/admin/components/CampusBoundaryEditor";

export function GeofenceConfigPage() {
  return (
    <CommandShell mode="admin" title="Operating areas">
      <CampusBoundaryEditor />
    </CommandShell>
  );
}
