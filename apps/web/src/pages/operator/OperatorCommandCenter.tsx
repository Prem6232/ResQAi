import { CommandShell } from "@/components/common/CommandShell";
import { LiveQueueTable } from "@/features/operator/components/LiveQueueTable";
import { CampusBaseMap } from "@/components/maps/CampusBaseMap";
import { IncidentMarker } from "@/components/maps/IncidentMarker";
import { ResponderMarker } from "@/components/maps/ResponderMarker";
import { PerimeterPolygon } from "@/components/maps/PerimeterPolygon";
import { mockEvidence, mockIncidents, mockResponders } from "@/lib/mock-store";
import { useState } from "react";
import { FireSmokeEvidenceCard } from "@/components/evidence/FireSmokeEvidenceCard";
import { Button } from "@/components/ui/button";
import { HumanOversightReviewModal } from "@/features/operator/components/HumanOversightReviewModal";
import { DuplicateResolutionPanel } from "@/features/operator/components/DuplicateResolutionPanel";
import { OperatorOverrideControl } from "@/features/operator/components/OperatorOverrideControl";

export function OperatorCommandCenter() {
  const [selected, setSelected] = useState(mockIncidents[0].id);
  const [modal, setModal] = useState<"dispatch" | "false" | null>(null);
  const incident = mockIncidents.find((i) => i.id === selected) ?? mockIncidents[0];
  const evidence = mockEvidence[incident.id];
  const open = mockIncidents.filter((i) => !["resolved", "closed", "cancelled"].includes(i.status));

  return (
    <CommandShell mode="operator" title="Live Dashboard">
      <p className="mb-4 text-xs text-ink-700/50">
        KPI tiles below are <strong>synthetic drill metrics</strong>, not live operational statistics.
      </p>
      <div className="mb-5 grid grid-cols-4 gap-3">
        <Kpi label="Average response time" value="—" hint="Recorded only when arrivals exist" />
        <Kpi label="False-alarm reviews" value="—" hint="Never auto-labelled by the model" />
        <Kpi label="Active responders" value={String(mockResponders.filter((r) => r.status !== "offline").length)} hint="Synthetic roster" />
        <Kpi label="Unreviewed reports" value={String(open.length)} hint="Queue depth" />
      </div>
      <div className="grid grid-cols-12 gap-4">
        <section className="col-span-3 rounded-3xl bg-[#f7f8fb] p-4">
          <h2 className="mb-3 text-sm font-semibold">Active incidents</h2>
          <LiveQueueTable incidents={open} selectedId={selected} onSelect={setSelected} />
        </section>
        <section className="col-span-5 overflow-hidden rounded-3xl bg-white p-2">
          <CampusBaseMap height={520} zoom={15}>
            <PerimeterPolygon />
            {mockIncidents.map((i) => (
              <IncidentMarker key={i.id} incident={i} />
            ))}
            {mockResponders.map((r) => (
              <ResponderMarker key={r.id} responder={r} />
            ))}
          </CampusBaseMap>
        </section>
        <section className="col-span-4 space-y-3 rounded-3xl bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold">Triage and AI support</h2>
          <FireSmokeEvidenceCard vision={evidence?.vision} />
          {evidence?.text ? (
            <p className="text-sm text-ink-700/70">{evidence.text.explanation}</p>
          ) : (
            <p className="text-sm text-ink-700/50">AI unavailable — manual review continues.</p>
          )}
          <p className="text-xs text-ink-700/45">
            Model score is not a “verified probability”. Human confirmation is required before dispatch.
          </p>
          <DuplicateResolutionPanel incidentId={incident.id} />
          <div className="rounded-2xl bg-paper-100 p-3 text-sm">
            Suggested resources (policy rank, not auto-assign): Fire unit F-2 · 5 min
          </div>
          <Button className="w-full" variant="duty" onClick={() => setModal("dispatch")}>
            Verify & dispatch
          </Button>
          <Button className="w-full" variant="outline" onClick={() => setModal("false")}>
            Open false-report review
          </Button>
          <OperatorOverrideControl />
        </section>
      </div>
      <HumanOversightReviewModal
        open={modal === "dispatch"}
        title="Confirm assignment offer"
        onOpenChange={() => setModal(null)}
        onConfirm={() => setModal(null)}
      />
      <HumanOversightReviewModal
        open={modal === "false"}
        title="Documented false / malicious review"
        onOpenChange={() => setModal(null)}
        onConfirm={() => setModal(null)}
      />
    </CommandShell>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-card">
      <p className="text-xs text-ink-700/50">{label}</p>
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="text-[11px] text-ink-700/40">{hint}</p>
    </div>
  );
}
