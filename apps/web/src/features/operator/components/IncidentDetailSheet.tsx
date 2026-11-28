import type { IncidentDetail } from "@/lib/api";
import type { Incident } from "@/types/incident";
import { AIEvidenceBadge } from "@/components/evidence/AIEvidenceBadge";
import { FireSmokeEvidenceCard } from "@/components/evidence/FireSmokeEvidenceCard";
import { DuplicateResolutionPanel } from "./DuplicateResolutionPanel";
import { IncidentTimeline } from "@/components/coordination/IncidentTimeline";
import { formatRelative } from "@/lib/utils";

export function IncidentDetailSheet({
  incident,
  detail,
}: {
  incident: Incident;
  detail?: IncidentDetail | null;
}) {
  const evidence = detail?.evidence;
  const linkedReports = detail?.linkedReports ?? [];
  const timeline = detail?.timeline ?? [];

  return (
    <div className="space-y-5 text-sm">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <AIEvidenceBadge label={incident.evidenceLabel} />
          <span className="rounded-full bg-paper-100 px-2.5 py-0.5 text-xs font-medium capitalize">
            {incident.status.replaceAll("_", " ")}
          </span>
          <span className="rounded-full bg-paper-100 px-2.5 py-0.5 text-xs font-medium uppercase">
            {incident.urgency}
          </span>
        </div>
        <p className="font-medium text-ink-900">{incident.locationLabel}</p>
        <p className="text-xs text-ink-700/50">
          Updated {formatRelative(incident.updatedAt)} · {incident.reportIds.length} linked report(s)
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-700/50">AI Evidence</h3>
        <FireSmokeEvidenceCard vision={evidence?.vision} />
        {evidence?.voice ? (
          <div className="rounded-2xl bg-sky-50/70 p-3 text-xs">
            <p className="font-semibold text-sky-900">
              Voice transcript ({evidence.voice.detectedLanguage}) · {Math.round(evidence.voice.confidence * 100)}%
            </p>
            <p className="mt-1 text-ink-800">"{evidence.voice.transcript}"</p>
          </div>
        ) : null}
        {evidence?.text ? (
          <div className="rounded-2xl bg-paper-100 p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">
                Text triage: {evidence.text.suggestedCategory.replaceAll("_", " ")} ({evidence.text.suggestedUrgency})
              </p>
              {evidence.text.reviewRequired ? (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                  Review Required
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-ink-700/70">{evidence.text.explanation}</p>
          </div>
        ) : null}
        <DuplicateResolutionPanel
          incidentId={incident.id}
          initialDuplicates={evidence?.duplicates}
        />
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-700/50">
          Linked Citizen Reports ({linkedReports.length})
        </h3>
        {linkedReports.length > 0 ? (
          <ul className="space-y-2">
            {linkedReports.map((r) => (
              <li key={r.id} className="rounded-2xl border border-black/5 p-3">
                <p className="font-medium">{r.text || "SOS emergency trigger"}</p>
                <p className="mt-1 text-xs text-ink-700/50">
                  Channel: {r.channel} · {formatRelative(r.createdAt)} · AI: {r.processingState.replaceAll("_", " ")}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-700/50">No linked citizen reports loaded.</p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-700/50">Status Timeline</h3>
        <IncidentTimeline events={timeline} />
      </div>
    </div>
  );
}
