import { CommandShell } from "@/components/common/CommandShell";
import { DuplicateResolutionPanel } from "@/features/operator/components/DuplicateResolutionPanel";
import { ReportMergeModal } from "@/components/coordination/ReportMergeModal";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function DuplicateMergeReviewPage() {
  const [open, setOpen] = useState(false);
  return (
    <CommandShell mode="operator" title="Duplicate review">
      <div className="max-w-xl space-y-4">
        <DuplicateResolutionPanel incidentId="inc_402" />
        <Button variant="command" onClick={() => setOpen(true)}>
          Merge with reason
        </Button>
      </div>
      <ReportMergeModal open={open} onOpenChange={setOpen} onConfirm={() => setOpen(false)} />
    </CommandShell>
  );
}
