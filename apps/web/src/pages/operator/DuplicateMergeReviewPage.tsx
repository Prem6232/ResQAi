import { CommandShell } from "@/components/common/CommandShell";
import { DuplicateResolutionPanel } from "@/features/operator/components/DuplicateResolutionPanel";
import { ReportMergeModal } from "@/components/coordination/ReportMergeModal";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useCallback } from "react";
import { mockApi, type DuplicatePairing } from "@/lib/mock-api";
import type { Incident } from "@/types/incident";

export function DuplicateMergeReviewPage() {
  const [open, setOpen] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [pairings, setPairings] = useState<DuplicatePairing[]>([]);
  const [targetId, setTargetId] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [incList, dupList] = await Promise.all([
      mockApi.incidents(),
      mockApi.duplicates(),
    ]);
    setIncidents(incList);
    setPairings(dupList);
    if (incList.length > 0) {
      setTargetId((prev) => (prev && incList.some((i) => i.id === prev) ? prev : incList[0].id));
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const targetIncident = incidents.find((i) => i.id === targetId) ?? incidents[0];
  const secondaryIncident = incidents.find((i) => i.id !== targetIncident?.id && i.reportIds.length > 0);

  const handleMergeConfirm = async (reason: string) => {
    if (targetIncident && secondaryIncident && secondaryIncident.reportIds.length > 0) {
      await mockApi.mergeReports(targetIncident.id, secondaryIncident.reportIds, reason);
      setStatusMessage(
        `Merged ${secondaryIncident.reportIds.length} report(s) into ${targetIncident.title}.`
      );
      await loadData();
    }
    setOpen(false);
  };

  return (
    <CommandShell mode="operator" title="Duplicate review">
      <div className="max-w-2xl space-y-4">
        <div className="rounded-3xl bg-white p-5 shadow-card space-y-3">
          <h2 className="text-sm font-semibold">Spatial duplicate pairings</h2>
          {pairings.length > 0 ? (
            <ul className="space-y-2">
              {pairings.map((p, idx) => (
                <li key={`${p.incidentIdA}-${p.incidentIdB}-${idx}`} className="rounded-2xl border border-black/5 p-3 text-sm">
                  <p className="font-semibold">
                    {p.incidentIdA} ↔ {p.incidentIdB} · Score {p.score.toFixed(2)} ({p.recommendation})
                  </p>
                  <p className="mt-1 text-xs text-ink-700/60">{p.signals.join(" · ")}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-700/50">No suspected cross-incident duplicate pairings.</p>
          )}
        </div>

        {targetIncident ? (
          <div className="rounded-3xl bg-white p-5 shadow-card space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-ink-700/50">
              Inspect incident candidates
              <select
                className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-normal"
                value={targetIncident.id}
                onChange={(e) => setTargetId(e.target.value)}
              >
                {incidents.map((inc) => (
                  <option key={inc.id} value={inc.id}>
                    {inc.title} ({inc.locationLabel})
                  </option>
                ))}
              </select>
            </label>
            <DuplicateResolutionPanel incidentId={targetIncident.id} />
            <Button
              variant="command"
              disabled={!secondaryIncident}
              onClick={() => setOpen(true)}
            >
              Merge related reports with reason
            </Button>
            {statusMessage ? <p className="text-xs text-duty-600">{statusMessage}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-ink-700/50">No active incidents to compare duplicates against.</p>
        )}
      </div>
      <ReportMergeModal open={open} onOpenChange={setOpen} onConfirm={handleMergeConfirm} />
    </CommandShell>
  );
}
