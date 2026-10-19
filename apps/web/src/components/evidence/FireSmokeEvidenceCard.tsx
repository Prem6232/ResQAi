import type { VisionAssessment } from "@/types/ai-evidence";

export function FireSmokeEvidenceCard({ vision }: { vision?: VisionAssessment }) {
  if (!vision || vision.finding === "unavailable") {
    return (
      <div className="rounded-2xl bg-slate-50 p-4 text-sm">
        Fire/smoke vision pipeline unavailable. Manual review continues.
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-sos-50 p-4 text-sm">
      <p className="font-semibold text-sos-600">Possible fire/smoke evidence</p>
      <p className="mt-1 text-ink-700/70">
        Adapter: {vision.adapter.replaceAll("_", " ")}. Model score is not the probability the
        incident is real.
      </p>
      {vision.modelScore != null ? (
        <p className="mt-2 text-xs">Relative model score: {vision.modelScore.toFixed(2)}</p>
      ) : null}
    </div>
  );
}
