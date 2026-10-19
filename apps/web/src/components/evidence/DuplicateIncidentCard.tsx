import type { DuplicateCandidate } from "@/types/ai-evidence";

export function DuplicateIncidentCard({ candidate }: { candidate: DuplicateCandidate }) {
  return (
    <div className="rounded-2xl border border-black/5 p-4 text-sm">
      <p className="font-semibold">Possible related incident {candidate.incidentId}</p>
      <p className="mt-1 text-ink-700/60">Signals: {candidate.signals.join(", ")}</p>
      <p className="mt-1 text-xs">
        Similarity score {candidate.score.toFixed(2)} · recommendation {candidate.recommendation}. A
        duplicate is not a malicious report.
      </p>
    </div>
  );
}
