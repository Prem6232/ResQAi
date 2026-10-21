import { CommandShell } from "@/components/common/CommandShell";
import { DuplicateResolutionPanel } from "@/features/operator/components/DuplicateResolutionPanel";
import { ReportMergeModal } from "@/components/coordination/ReportMergeModal";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { mockApi } from "@/lib/mock-api";
import type { Incident } from "@/types/incident";

export function DuplicateMergeReviewPage() {
  const [open, setOpen] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  useEffect(() => {
    mockApi.incidents().then(setIncidents);
  }, []);

  const currentId = incidents[0]?.id || "";

  const handleMergeConfirm = async (reason: string) => {
    if (currentId && incidents.length > 1) {
      await mockApi.mergeReports(currentId, [incidents[1].id], reason);
      const updated = await mockApi.incidents();
      setIncidents(updated);
    }
    setOpen(false);
  };

  return (
    <CommandShell mode="operator" title="Duplicate review">
      <div className="max-w-xl space-y-4">
        {currentId ? (
          <DuplicateResolutionPanel incidentId={currentId} />
        ) : (
          <p className="text-sm text-ink-700/50">No active incidents to compare duplicates against.</p>
        )}
        <Button variant="command" disabled={!currentId} onClick={() => setOpen(true)}>
          Merge with reason
        </Button>
      </div>
      <ReportMergeModal open={open} onOpenChange={setOpen} onConfirm={handleMergeConfirm} />
    </CommandShell>
  );
}
