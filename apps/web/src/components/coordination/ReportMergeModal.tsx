import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";

export function ReportMergeModal({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (reason: string) => Promise<void> | void;
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
      setError(err instanceof Error ? err.message : "Failed to record merge.");
    } finally {
      setSubmitting(false);
    }
  };

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
        {error ? <p className="mt-2 text-xs font-medium text-rose-600">{error}</p> : null}
        <Button className="mt-4" variant="command" disabled={!reason.trim() || submitting} onClick={() => void handleConfirm()}>
          {submitting ? "Recording merge..." : "Record merge"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
