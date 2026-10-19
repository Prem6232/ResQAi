import { mockIncidents } from "@/lib/mock-store";
import { StatusIndicator } from "@/components/common/StatusIndicator";
import { formatRelative } from "@/lib/utils";

export function ResponderHistoryPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold">History</h1>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat n="7" l="Jobs" />
        <Stat n="4.3m" l="Avg arrival*" />
        <Stat n="—" l="Accept rate" />
      </div>
      <p className="mt-2 text-[11px] text-ink-700/45">*Demo drill measurements, not live operational KPIs.</p>
      <div className="mt-4 space-y-2">
        {mockIncidents.map((inc) => (
          <div key={inc.id} className="flex items-center justify-between rounded-3xl bg-white p-4 shadow-card">
            <div>
              <p className="font-medium">{inc.title}</p>
              <p className="text-xs text-ink-700/50">{formatRelative(inc.updatedAt)}</p>
            </div>
            <StatusIndicator label={inc.status.replaceAll("_", " ")} tone="neutral" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div className="rounded-3xl bg-white p-3 text-center shadow-card">
      <p className="font-display text-xl font-bold">{n}</p>
      <p className="text-[10px] text-ink-700/50">{l}</p>
    </div>
  );
}
