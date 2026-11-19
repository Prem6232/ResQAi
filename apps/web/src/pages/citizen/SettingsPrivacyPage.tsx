import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { useState } from "react";

interface DeletionReceipt {
  requestId: string;
  recordedAt: string;
  message: string;
}

export function SettingsPrivacyPage() {
  const { logout, user } = useAuth();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<DeletionReceipt | null>(null);

  const handleRequestDeletion = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.requestDataDeletion(reason);
      setReceipt({
        requestId: res.requestId,
        recordedAt: res.recordedAt,
        message: res.message,
      });
    } catch {
      setError("Could not submit deletion request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-extrabold">Privacy and consent</h1>
      <p className="text-sm text-ink-700/70">
        You can request deletion of your personal reports subject to campus safety retention and
        audit policy. Precise personal-safety locations are hidden on public maps.
      </p>
      <label className="block text-xs font-medium text-ink-700/70">
        Optional rationale for audit log
        <Input
          className="mt-1"
          placeholder="e.g. Remove resolved report metadata from my profile"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={Boolean(receipt)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={Boolean(receipt) || submitting}
          onClick={() => void handleRequestDeletion()}
        >
          {submitting
            ? "Submitting request…"
            : receipt
              ? "Deletion request logged"
              : "Request data deletion"}
        </Button>
        <Button variant="ghost" onClick={logout}>
          Sign out
        </Button>
      </div>
      {error ? <p className="text-xs text-sos-600">{error}</p> : null}
      {receipt ? (
        <div className="rounded-2xl bg-paper-100 p-3 text-xs text-ink-700">
          <p className="font-semibold">
            Privacy request logged for {user?.email || "your account"} (Ref: {receipt.requestId})
          </p>
          <p className="mt-1 text-ink-700/75">{receipt.message}</p>
        </div>
      ) : null}
    </div>
  );
}
