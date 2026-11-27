import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";

export function HumanOversightReviewModal({
  open,
  title,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  onConfirm: (reason: string) => Promise<void> | void;
  onOpenChange: (v: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setReason("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    const trimmed = reason.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(trimmed);
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>Human confirmation is required. AI cannot dispatch.</DialogDescription>
        <Textarea className="mt-3" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
        {error ? <p className="mt-2 text-xs font-medium text-rose-600">{error}</p> : null}
        <Button className="mt-4" variant="command" disabled={!reason.trim() || submitting} onClick={() => void handleConfirm()}>
          {submitting ? "Confirming..." : "Confirm"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
