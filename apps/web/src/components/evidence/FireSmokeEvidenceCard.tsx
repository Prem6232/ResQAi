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
      <p className="font-semibold text-sos-600">
        {vision.finding === "possible_fire_smoke_evidence"
          ? "Possible fire/smoke evidence"
          : "No supported fire/smoke visual evidence"}
      </p>
      <p className="mt-1 text-ink-700/70">
        {vision.explanation
          ? vision.explanation
          : `Adapter: ${vision.adapter.replaceAll("_", " ")}. Model score is not the probability the incident is real.`}
      </p>
      {vision.modelScore != null ? (
        <p className="mt-2 text-xs text-ink-700/60">
          Relative model score: {vision.modelScore.toFixed(2)} ({vision.adapter.replaceAll("_", " ")})
        </p>
      ) : null}
    </div>
  );
}
