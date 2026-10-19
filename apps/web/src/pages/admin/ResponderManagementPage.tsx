import { CommandShell } from "@/components/common/CommandShell";
import { ResponderApprovalTable } from "@/features/admin/components/ResponderApprovalTable";

export function ResponderManagementPage() {
  return (
    <CommandShell mode="admin" title="Responder management">
      <div className="rounded-3xl bg-white p-5 shadow-card">
        <ResponderApprovalTable />
      </div>
    </CommandShell>
  );
}
