import { CommandShell } from "@/components/common/CommandShell";
import { LiveQueueTable } from "@/features/operator/components/LiveQueueTable";
import { CampusBaseMap } from "@/components/maps/CampusBaseMap";
import { IncidentMarker } from "@/components/maps/IncidentMarker";
import { ResponderMarker } from "@/components/maps/ResponderMarker";
import { PerimeterPolygon } from "@/components/maps/PerimeterPolygon";
import { mockApi } from "@/lib/mock-api";
import { useState, useEffect } from "react";
import type { Incident } from "@/types/incident";
import type { ResponderProfile } from "@/types/responder";
import { FireSmokeEvidenceCard } from "@/components/evidence/FireSmokeEvidenceCard";
import { Button } from "@/components/ui/button";
import { HumanOversightReviewModal } from "@/features/operator/components/HumanOversightReviewModal";
import { DuplicateResolutionPanel } from "@/features/operator/components/DuplicateResolutionPanel";
import { OperatorOverrideControl } from "@/features/operator/components/OperatorOverrideControl";

export function OperatorCommandCenter() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [responders, setResponders] = useState<ResponderProfile[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [modal, setModal] = useState<"dispatch" | "false" | null>(null);

  useEffect(() => {
    mockApi.incidents().then((list) => {
      setIncidents(list);
      if (list.length > 0) {
        setSelected((prev) => prev || list[0].id);
      }
    });
    mockApi.responders().then(setResponders);
  }, []);

  const open = incidents.filter((i) => !["resolved", "closed", "cancelled"].includes(i.status));
  const incident = incidents.find((i) => i.id === selected) ?? open[0] ?? incidents[0];

  return (
    <CommandShell mode="operator" title="Live Dashboard">
      <div className="mb-5 grid grid-cols-4 gap-3">
        <Kpi label="Average response time" value="4.2m" hint="Live network dispatch" />
        <Kpi label="False-alarm reviews" value="0" hint="Verified human oversight" />
        <Kpi label="Active responders" value={String(responders.filter((r) => r.status !== "offline").length)} hint="Live active roster" />
        <Kpi label="Unreviewed reports" value={String(open.length)} hint="Queue depth" />
      </div>
      <div className="grid grid-cols-12 gap-4">
        <section className="col-span-3 rounded-3xl bg-[#f7f8fb] p-4">
          <h2 className="mb-3 text-sm font-semibold">Active incidents</h2>
          {open.length > 0 ? (
            <LiveQueueTable incidents={open} selectedId={selected} onSelect={setSelected} />
          ) : (
            <p className="text-xs text-ink-700/50">No active incidents in queue.</p>
          )}
        </section>
        <section className="col-span-5 overflow-hidden rounded-3xl bg-white p-2">
          <CampusBaseMap height={520} zoom={15}>
            <PerimeterPolygon />
            {incidents.map((i) => (
              <IncidentMarker key={i.id} incident={i} />
            ))}
            {responders.map((r) => (
              <ResponderMarker key={r.id} responder={r} />
            ))}
          </CampusBaseMap>
        </section>
        <section className="col-span-4 space-y-3 rounded-3xl bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold">Triage and AI support</h2>
          {incident ? (
            <>
              <FireSmokeEvidenceCard />
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
            </>
          ) : (
            <p className="text-sm text-ink-700/50">Select an incident to view triage assessment.</p>
          )}
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
