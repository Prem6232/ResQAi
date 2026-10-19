import { CommandShell } from "@/components/common/CommandShell";
import { AuditLogViewer } from "@/features/admin/components/AuditLogViewer";

export function SecurityAuditPage() {
  return (
    <CommandShell mode="admin" title="Security audit">
      <AuditLogViewer />
    </CommandShell>
  );
}
