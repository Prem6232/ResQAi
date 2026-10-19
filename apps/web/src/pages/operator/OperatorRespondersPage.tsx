import { CommandShell } from "@/components/common/CommandShell";
import { mockResponders } from "@/lib/mock-store";
import { StatusIndicator } from "@/components/common/StatusIndicator";
import { Table, Td, Th } from "@/components/ui/table";

export function OperatorRespondersPage() {
  const counts = {
    onDuty: mockResponders.filter((r) => r.status !== "offline" && r.status !== "off_duty").length,
    available: mockResponders.filter((r) => r.status === "available").length,
    busy: mockResponders.filter((r) => r.status === "busy").length,
    offline: mockResponders.filter((r) => r.status === "offline").length,
  };
  return (
    <CommandShell mode="operator" title="Responders">
      <div className="mb-5 grid grid-cols-4 gap-3">
        <Tile n={counts.onDuty} l="On duty" />
        <Tile n={counts.available} l="Available" />
        <Tile n={counts.busy} l="Busy" />
        <Tile n={counts.offline} l="Offline" />
      </div>
      <div className="rounded-3xl bg-white p-4 shadow-card">
        <Table>
          <thead>
            <tr>
              <Th>Unit</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>Last location</Th>
              <Th>Current job</Th>
            </tr>
          </thead>
          <tbody>
            {mockResponders.map((r) => (
              <tr key={r.id} className="border-t">
                <Td className="font-semibold">{r.unitCode}</Td>
                <Td>{r.type.replaceAll("_", " ")}</Td>
                <Td>
                  <StatusIndicator
                    label={r.status.replaceAll("_", " ")}
                    tone={r.status === "available" ? "ok" : r.status === "busy" ? "warn" : "neutral"}
                  />
                </Td>
                <Td>{r.lastLocation ? "Shared (authorized)" : "Hidden / stale"}</Td>
                <Td>{r.currentJob ?? "None"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </CommandShell>
  );
}

function Tile({ n, l }: { n: number; l: string }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-card">
      <p className="font-display text-2xl font-bold">{n}</p>
      <p className="text-xs text-ink-700/50">{l}</p>
    </div>
  );
}
