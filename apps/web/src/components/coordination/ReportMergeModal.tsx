import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

export function ReportMergeModal({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Merge reports into one incident</DialogTitle>
        <p className="mt-2 text-sm text-ink-700/70">
          Original submissions stay in the audit trail. Merge does not discard evidence.
        </p>
        <Textarea
          className="mt-3"
          placeholder="Reason for merge"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button className="mt-4" variant="command" disabled={!reason.trim()} onClick={() => onConfirm(reason)}>
          Record merge
        </Button>
      </DialogContent>
    </Dialog>
  );
}
