import type { VisionAssessment } from "@/types/ai-evidence";

export function FireSmokeEvidenceCard({ vision }: { vision?: VisionAssessment }) {
  if (!vision || vision.finding === "unavailable") {
    return (
      <div className="rounded-2xl bg-slate-50 p-4 text-sm">
        Fire/smoke vision pipeline unavailable. Manual review continues.
      </div>
    );
  }
  const hasFireOrSmoke = vision.finding === "possible_fire_smoke_evidence";
  const boxCount = vision.boundingBoxes?.length ?? 0;
  const boxLabels = Array.from(new Set((vision.boundingBoxes ?? []).map((b) => b.label.replaceAll("_", " "))));
  return (
    <div className={hasFireOrSmoke ? "rounded-2xl bg-sos-50 p-4 text-sm" : "rounded-2xl bg-emerald-50/70 p-4 text-sm"}>
      <p className={hasFireOrSmoke ? "font-semibold text-sos-600" : "font-semibold text-emerald-700"}>
        {hasFireOrSmoke
          ? "Possible fire/smoke evidence"
          : "No supported fire/smoke visual evidence"}
      </p>
      <p className="mt-1 text-ink-700/70">
        {vision.explanation
          ? vision.explanation
          : `Adapter: ${(vision.adapter ?? "vision_pipeline").replaceAll("_", " ")}. Model score is not the probability the incident is real.`}
      </p>
      {boxCount > 0 ? (
        <p className="mt-1.5 text-xs font-medium text-sos-700">
          Detections ({boxCount}): {boxLabels.join(", ")}
        </p>
      ) : null}
      {vision.modelScore != null ? (
        <p className="mt-2 text-xs text-ink-700/60">
          Relative model score: {vision.modelScore.toFixed(2)} ({(vision.adapter ?? "vision_pipeline").replaceAll("_", " ")}
          {vision.modelVersion ? ` · ${vision.modelVersion}` : ""})
        </p>
      ) : null}
    </div>
  );
}
