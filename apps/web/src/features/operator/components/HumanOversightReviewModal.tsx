import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

export function HumanOversightReviewModal({
  open,
  title,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  onConfirm: (reason: string) => void;
  onOpenChange: (v: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <p className="mt-2 text-sm text-ink-700/70">Human confirmation is required. AI cannot dispatch.</p>
        <Textarea className="mt-3" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
        <Button className="mt-4" variant="command" disabled={!reason.trim()} onClick={() => onConfirm(reason)}>
          Confirm
        </Button>
      </DialogContent>
    </Dialog>
  );
}
