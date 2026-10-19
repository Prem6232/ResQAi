import { CommandShell } from "@/components/common/CommandShell";
import { AuditLogViewer } from "@/features/admin/components/AuditLogViewer";

export function OperatorAuditPage() {
  return (
    <CommandShell mode="operator" title="Audit Log">
      <AuditLogViewer />
    </CommandShell>
  );
}
