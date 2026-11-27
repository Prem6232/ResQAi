import { useOfflineSync } from "@/hooks/useOfflineSync";
import { Button } from "@/components/ui/button";

export function OfflineReportDraftsList() {
  const { drafts, remove, flushDrafts, syncing, online } = useOfflineSync();
  if (!drafts.length) {
    return <p className="text-sm text-ink-700/50">No undelivered drafts on this device.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-700/60">
          {drafts.length} pending report{drafts.length > 1 ? "s" : ""} queued offline
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={!online || syncing}
          onClick={() => void flushDrafts()}
        >
          {syncing ? "Syncing…" : online ? "Retry sync now" : "Offline"}
        </Button>
      </div>
      <ul className="space-y-3">
        {drafts.map((d) => (
          <li key={d.idempotencyKey} className="rounded-2xl bg-white p-4 shadow-card">
            <p className="text-xs font-semibold text-amber-700">Saved on this device — not yet delivered</p>
            <p className="mt-1 text-sm">{d.text || d.channel.toUpperCase()}</p>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => void remove(d.idempotencyKey)}>
              Delete local draft
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
